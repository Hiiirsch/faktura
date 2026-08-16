/**
 * Strukturierte Protokollierung (NFA-BETR-09, -10).
 *
 * Die zweite Zusage ist die, die man nicht durch Hinsehen prüfen kann:
 * **keine Passwörter, Token oder vollständigen Kundendatensätze im Log.** Sie
 * hängt nicht an der Disziplin der Aufrufer, sondern am Schreibweg — deshalb
 * wird hier genau der geprüft, mit den Feldnamen, die in dieser Anwendung
 * tatsächlich vorkommen.
 */
import { afterEach, describe, expect, it } from 'vitest';

import { logger, redact, REDACTED, setLogSink } from '@/infrastructure/logging/logger';

let restore: (() => void) | null = null;

afterEach(() => {
  restore?.();
  restore = null;
});

/** Fängt die geschriebenen Zeilen ab. */
function capture(): { lines: string[]; entries: () => readonly Record<string, unknown>[] } {
  const lines: string[] = [];
  restore = setLogSink((line) => lines.push(line));
  return {
    lines,
    entries: () => lines.map((line) => JSON.parse(line) as Record<string, unknown>),
  };
}

describe('NFA-BETR-09 Eine Zeile, ein Objekt', () => {
  it('schreibt gültiges JSON mit Zeitpunkt, Stufe und Ereignis', () => {
    const sink = capture();

    logger.info('backup.created', { sizeBytes: 4_096 });

    expect(sink.lines).toHaveLength(1);
    const [entry] = sink.entries();
    expect(entry?.level).toBe('info');
    expect(entry?.event).toBe('backup.created');
    expect(entry?.sizeBytes).toBe(4_096);
    expect(typeof entry?.ts).toBe('string');
    // Ein Zeitstempel, der sich sortieren lässt.
    expect(String(entry?.ts)).toMatch(/^\d{4}-\d{2}-\d{2}T/u);
  });

  it('schreibt jedes Ereignis in genau eine Zeile', () => {
    const sink = capture();

    logger.error('renderer.pdf_failed', { error: new Error('Zeile eins\nZeile zwei') });

    expect(sink.lines).toHaveLength(1);
    expect(sink.lines[0]?.includes('\n')).toBe(false);
  });

  it('kennzeichnet sicherheitsrelevante Ereignisse in einem Feld', () => {
    const sink = capture();

    logger.security('auth.login_failed', { userId: 'u1' });
    logger.info('backup.created', {});

    const [security, ordinary] = sink.entries();
    // Erkennbar an einem Feld, nicht am Wortlaut: So lässt sich danach
    // filtern, ohne Ereignisnamen zu kennen.
    expect(security?.category).toBe('security');
    expect(security?.level).toBe('warn');
    expect(ordinary?.category).toBeUndefined();
  });

  it('behält den Stacktrace eines Fehlers', () => {
    const sink = capture();

    logger.error('event.handler_failed', { error: new Error('kaputt') });

    const [entry] = sink.entries();
    const error = entry?.error as Record<string, unknown> | undefined;
    expect(error?.message).toBe('kaputt');
    expect(typeof error?.stack).toBe('string');
  });
});

describe('NFA-BETR-10 Geheimnisse erreichen das Log nicht', () => {
  it('entfernt Passwörter, Token, Hashes und Geheimnisse', () => {
    const cleaned = redact({
      password: 'Zwetschgenkuchen-mit-Streuseln-7',
      passwordHash: '$argon2id$v=19$m=65536',
      sessionToken: 'abc',
      tokenHash: 'def',
      csrfToken: 'ghi',
      totpSecret: 'JBSWY3DP',
      recoveryCode: 'ABCD-EFGH',
      authorization: 'Bearer xyz',
      cookie: 'faktura_session=…',
    });

    for (const value of Object.values(cleaned)) {
      expect(value).toBe(REDACTED);
    }
  });

  it('greift auch in verschachtelten Feldern', () => {
    const cleaned = redact({ user: { id: 'u1', email: 'a@b.example', passwordHash: 'geheim' } });
    const user = cleaned.user as Record<string, unknown>;

    expect(user.id).toBe('u1');
    expect(user.passwordHash).toBe(REDACTED);
  });

  it('lässt Bankverbindungen nicht durch', () => {
    // Eine IBAN ist kein Geheimnis im engeren Sinn, aber ein vollständiger
    // Kundendatensatz gehört nicht ins Log (NFA-BETR-10).
    const cleaned = redact({ iban: 'DE89370400440532013000', bic: 'COBADEFFXXX' });

    expect(cleaned.iban).toBe(REDACTED);
    expect(cleaned.bic).toBe(REDACTED);
  });

  it('kürzt lange Zeichenketten statt sie vollständig abzulegen', () => {
    const cleaned = redact({ note: 'x'.repeat(500) });

    expect(String(cleaned.note).length).toBeLessThan(250);
    expect(String(cleaned.note).endsWith('…')).toBe(true);
  });

  it('bricht bei tief verschachtelten Objekten ab', () => {
    const deep = { a: { b: { c: { d: { e: { f: 'zu tief' } } } } } };

    // Ohne Tiefenbegrenzung wäre ein versehentlich übergebener
    // Prisma-Datensatz mit allen Beziehungen im Log gelandet.
    expect(JSON.stringify(redact(deep))).toContain(REDACTED);
  });

  it('lässt aus, was in ein Protokoll nicht gehört', () => {
    const cleaned = redact({ callback: () => undefined, missing: undefined, ok: 1 });

    expect('callback' in cleaned).toBe(false);
    expect('missing' in cleaned).toBe(false);
    expect(cleaned.ok).toBe(1);
  });
});
