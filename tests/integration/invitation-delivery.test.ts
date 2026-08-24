/**
 * Zugestellt **und** vorgelesen (M14, B2 — FA-MEMB-08).
 *
 * Das ist die Zusage, die dieser Baustein am leichtesten still gebrochen hätte:
 * Sobald eine Mail hinausgeht, liegt es nahe, den Link aus der Oberfläche zu
 * nehmen — er steht ja jetzt woanders. Dann aber hängt der Zugang an einem
 * Postfach und an einem Mailserver, den ein Betreiber am Tag der Einrichtung
 * für richtig konfiguriert hielt. Wer die Nachricht nicht bekommt, käme nicht
 * herein, und niemand könnte ihm helfen.
 *
 * Geprüft wird deshalb **beides in einem Durchlauf**: Die Nachricht kommt bei
 * einem echten SMTP-Empfänger an, und derselbe Aufruf gibt den Token zurück.
 * Die Tests in `membership.test.ts` decken den anderen Fall ab — ohne
 * Konfiguration bleibt es beim Vorlesen.
 *
 * **Warum die Module hier erst im `beforeAll` geladen werden.** `getEnv()` und
 * der Versender halten ihr Ergebnis fest; ein `import` am Dateikopf liefe, bevor
 * `SMTP_URL` gesetzt ist, und der Versand wäre für immer „nicht eingerichtet" —
 * ein Test, der nichts prüft und trotzdem grün ist.
 */
import { PrismaClient } from '@prisma/client';
import { SMTPServer } from 'smtp-server';
import { afterAll, beforeAll, beforeEach, describe, expect, it } from 'vitest';

import type { inviteMember as InviteMember } from '@/application/members/invitation-service';
import type { startPasswordReset as StartPasswordReset } from '@/application/members/member-service';
import type { addRole as AddRole } from '@/application/roles/role-service';
import type { closeMailer as CloseMailer } from '@/infrastructure/mail/mailer';

import { DATA_DATABASE_URL, resetDatabase, TEST_ACTOR_ID } from './setup/database';
import { testOrganization } from './setup/organization';

const PORT = 3926;
const NOW = new Date();

/** Was der Empfänger angenommen hat. */
const empfangen: string[] = [];

const prisma = new PrismaClient({ datasources: { db: { url: DATA_DATABASE_URL } } });

let server: SMTPServer;
let inviteMember: typeof InviteMember;
let startPasswordReset: typeof StartPasswordReset;
let addRole: typeof AddRole;
let closeMailer: typeof CloseMailer;

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

  process.env.SMTP_URL = `smtp://127.0.0.1:${String(PORT)}`;
  process.env.MAIL_FROM = 'Faktura <faktura@example.org>';

  ({ inviteMember } = await import('@/application/members/invitation-service'));
  ({ startPasswordReset } = await import('@/application/members/member-service'));
  ({ addRole } = await import('@/application/roles/role-service'));
  ({ closeMailer } = await import('@/infrastructure/mail/mailer'));
});

afterAll(async () => {
  closeMailer();
  // Vor dem Trennen der Datenbank: Ein offener Client hinge sonst an einer
  // abgehängten Datei (siehe CLAUDE.md, „Ein Fallstrick der Integrationstests").
  await prisma.$disconnect();
  await new Promise<void>((resolve) => {
    server.close(() => {
      resolve();
    });
  });

  delete process.env.SMTP_URL;
  delete process.env.MAIL_FROM;
});

beforeEach(async () => {
  await prisma.$disconnect();
  await resetDatabase();
  empfangen.length = 0;
});

/** Die zuletzt angenommene Nachricht — als Rohtext, wie der Empfänger sie sah. */
function letzteNachricht(): string {
  return empfangen[empfangen.length - 1] ?? '';
}

async function seedRole(): Promise<string> {
  const result = await addRole(testOrganization, {
    name: 'Buchhaltung',
    description: null,
    permissionKeys: ['invoice.read'],
  }, TEST_ACTOR_ID, null);

  if (!result.ok) throw new Error('Rolle konnte nicht angelegt werden');
  return result.value.id;
}

describe('FA-MEMB-08 Der Link geht hinaus und bleibt trotzdem stehen', () => {
  it('stellt die Einladung zu — und gibt den Token weiterhin zurück', async () => {
    const roleId = await seedRole();

    const result = await inviteMember(
      testOrganization,
      { email: 'neu@example.org', roleId },
      TEST_ACTOR_ID,
      null,
      NOW,
    );

    expect(result.ok).toBe(true);
    if (!result.ok) return;

    // 1. Zugestellt.
    expect(result.value.delivery).toBe('sent');
    expect(empfangen.length).toBe(1);
    expect(letzteNachricht()).toContain('neu@example.org');

    // 2. Und **derselbe** Link steht in der Oberfläche. Das ist der Punkt:
    //    Ein Token, der nur in der Mail steht, sperrt aus, sobald sie nicht
    //    ankommt.
    expect(result.value.token.length).toBeGreaterThan(20);
    expect(letzteNachricht()).toContain(result.value.token);
  }, 30_000);

  it('nennt die Frist in der Nachricht und wirbt nicht', async () => {
    const roleId = await seedRole();

    const result = await inviteMember(
      testOrganization,
      { email: 'frist@example.org', roleId },
      TEST_ACTOR_ID,
      null,
      NOW,
    );
    expect(result.ok).toBe(true);

    const nachricht = letzteNachricht();
    // Wer eine unerwartete Nachricht bekommt, soll nicht raten müssen.
    expect(nachricht).toContain('gilt bis');
    // Text, kein Markup — dieselbe Zusage wie in der Oberfläche (NFA-COMP-06).
    expect(nachricht).toContain('text/plain');
    expect(nachricht).not.toContain('<html');
  }, 30_000);

  it('stellt auch die Zurücksetzung zu, ohne das Passwort zu nennen', async () => {
    const roleId = await seedRole();
    const invited = await inviteMember(
      testOrganization,
      { email: 'mitglied@example.org', roleId },
      TEST_ACTOR_ID,
      null,
      NOW,
    );
    expect(invited.ok).toBe(true);
    if (!invited.ok) return;

    const { acceptInvitation } = await import('@/application/members/redeem');
    const passwort = 'Zwetschgenkuchen-mit-Streuseln-7';
    const accepted = await acceptInvitation(
      invited.value.token,
      { name: 'Mitglied', password: passwort },
      null,
      NOW,
    );
    expect(accepted.ok).toBe(true);

    const mitglied = await prisma.user.findFirstOrThrow({
      where: { email: 'mitglied@example.org' },
    });

    const reset = await startPasswordReset(
      testOrganization,
      mitglied.id,
      TEST_ACTOR_ID,
      null,
      NOW,
    );

    expect(reset.ok).toBe(true);
    if (!reset.ok) return;
    expect(reset.value.delivery).toBe('sent');
    expect(reset.value.token.length).toBeGreaterThan(20);

    const nachricht = letzteNachricht();
    expect(nachricht).toContain(reset.value.token);
    /*
     * Die Rechteverwaltung stellt einen Nachweis aus, sie vergibt kein Passwort
     * (M8). Stünde eines in der Nachricht, hätte der Vorgang zwei Wissende —
     * und der erste Wechsel danach wäre freiwillig.
     */
    expect(nachricht).not.toContain(passwort);
  }, 30_000);
});
