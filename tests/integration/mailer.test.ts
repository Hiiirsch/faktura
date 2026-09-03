/**
 * Der Versandweg gegen einen echten Empfänger (M14 — NFA-COMP-05, NFA-BETR-12).
 *
 * **Kein nachgebauter Versender.** Eine Attrappe prüfte, dass wir eine Funktion
 * aufrufen; hier läuft ein SMTP-Server auf `localhost`, nimmt die Nachricht
 * entgegen und behält sie zum Nachlesen. Was geprüft wird, ist damit die
 * Zustellung und nicht unsere Absicht.
 *
 * Die drei Zusagen, um die es geht:
 *
 * 1. Ohne Konfiguration wird **nichts** verschickt — und das ist ein
 *    Rückgabewert, keine Ausnahme.
 * 2. Mit Konfiguration kommt die Nachricht an, als **Text**.
 * 3. Ein Fehlschlag ist ein Ergebnis, kein Absturz: Der Aufrufer soll seine
 *    Handlung zu Ende bringen können.
 */
import { SMTPServer } from 'smtp-server';

import { afterAll, beforeAll, describe, expect, it, vi } from 'vitest';

import type * as MailerModule from '@/infrastructure/mail/mailer';

type Mailer = typeof MailerModule;

const PORT = 3925;

/** Was der Empfänger angenommen hat. */
const empfangen: string[] = [];

let server: SMTPServer;

beforeAll(async () => {
  server = new SMTPServer({
    authOptional: true,
    disabledCommands: ['STARTTLS'],
    onData(stream, _session, callback) {
      let inhalt = '';
      stream.on('data', (chunk: Buffer) => (inhalt += chunk.toString('utf8')));
      stream.on('end', () => {
        empfangen.push(inhalt);
        callback();
      });
    },
  });

  await new Promise<void>((resolve) => {
    server.listen(PORT, '127.0.0.1', resolve);
  });
});

afterAll(async () => {
  await new Promise<void>((resolve) => {
    server.close(() => {
      resolve();
    });
  });
});

/**
 * Das Mailmodul liest die Umgebung **beim ersten Aufruf** und behält den
 * Versender; `getEnv()` hält seinerseits das Ergebnis fest. Für jeden Fall
 * werden deshalb beide Module frisch geladen.
 *
 * `vi.resetModules()` statt einer Rücksetzfunktion im Anwendungscode: Eine
 * Klappe, die nur Tests benutzen, steht sonst für immer im Quelltext und lädt
 * dazu ein, sie auch anderswo aufzumachen.
 */
async function mailerMit(konfiguration: Record<string, string | undefined>): Promise<Mailer> {
  for (const [schlüssel, wert] of Object.entries(konfiguration)) {
    if (wert === undefined) {
      delete process.env[schlüssel];
    } else {
      process.env[schlüssel] = wert;
    }
  }

  vi.resetModules();
  return import('@/infrastructure/mail/mailer');
}

describe('NFA-COMP-05 Ohne Konfiguration bleibt die Anwendung offline', () => {
  it('stellt nichts zu und sagt es als Ergebnis', async () => {
    const mailer = await mailerMit({ SMTP_URL: undefined, MAIL_FROM: undefined });

    expect(mailer.isMailConfigured()).toBe(false);

    const ergebnis = await mailer.sendMail({
      to: 'jemand@example.org',
      subject: 'Einladung',
      text: 'Link',
    });

    expect(ergebnis.ok).toBe(false);
    if (ergebnis.ok) return;
    expect(ergebnis.reason).toBe('not-configured');
  }, 30_000);

  it('bleibt aus, wenn nur die halbe Konfiguration da ist', async () => {
    // Eine Adresse ohne Absender ist keine Konfiguration, sondern eine halbe.
    const mailer = await mailerMit({
      SMTP_URL: `smtp://127.0.0.1:${String(PORT)}`,
      MAIL_FROM: undefined,
    });

    expect(mailer.isMailConfigured()).toBe(false);
  }, 30_000);
});

describe('NFA-BETR-12 Mit Konfiguration kommt die Nachricht an', () => {
  it('stellt sie als Text zu, mit Absender und Betreff', async () => {
    const mailer = await mailerMit({
      SMTP_URL: `smtp://127.0.0.1:${String(PORT)}`,
      MAIL_FROM: 'Faktura <faktura@example.org>',
    });

    expect(mailer.isMailConfigured()).toBe(true);

    const vorher = empfangen.length;
    const ergebnis = await mailer.sendMail({
      to: 'mitglied@example.org',
      subject: 'Einladung zu Faktura',
      text: 'Ihr Link: https://example.org/invitations/abc',
    });

    expect(ergebnis.ok).toBe(true);
    expect(empfangen.length).toBe(vorher + 1);

    const nachricht = empfangen[empfangen.length - 1] ?? '';
    expect(nachricht).toContain('mitglied@example.org');
    expect(nachricht).toContain('Einladung zu Faktura');
    expect(nachricht).toContain('/invitations/abc');

    // Text, kein HTML: kein Rumpf mit Markup, keine nachgeladenen Bilder.
    expect(nachricht).not.toContain('<html');
    expect(nachricht).toContain('text/plain');

    mailer.closeMailer();
  }, 30_000);

  it('gibt einen Fehlschlag zurück, statt zu werfen', async () => {
    /*
     * Der Aufrufer soll seine Handlung zu Ende bringen: Wer ein Mitglied
     * einlädt, hat es eingeladen — auch wenn kein Mailserver antwortet.
     */
    const mailer = await mailerMit({
      SMTP_URL: 'smtp://127.0.0.1:1',
      MAIL_FROM: 'Faktura <faktura@example.org>',
    });

    const ergebnis = await mailer.sendMail({
      to: 'mitglied@example.org',
      subject: 'Einladung',
      text: 'Link',
    });

    expect(ergebnis.ok).toBe(false);
    if (ergebnis.ok) return;
    expect(ergebnis.reason).toBe('failed');

    mailer.closeMailer();
  }, 30_000);
});
