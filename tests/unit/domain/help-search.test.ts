/**
 * Die Suche im Handbuch (M16, FA-DOC-02, -03).
 *
 * Zwei Dinge werden geprüft, und das zweite ist das wichtigere:
 *
 * 1. Die Suche findet, was sie finden soll — über Groß-/Kleinschreibung und
 *    Akzente hinweg, und enger mit jedem weiteren Wort.
 * 2. **Das Handbuch nennt keine Zahl, die es als Konstante gibt.** Eine
 *    Dokumentation, die neben der Wirklichkeit herläuft, ist schlimmer als
 *    keine — sie ist eine Zusage, die niemand hält. Wer eine Frist ändert und
 *    den Text vergisst, kommt hier nicht vorbei. Dieselbe Bauart wie
 *    `privacy-notice.test.ts` seit M13.
 */
import { readdir, readFile } from 'node:fs/promises';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

import { describe, expect, it } from 'vitest';

import { LOCKOUT_DURATION_MS, MAX_FAILED_LOGINS } from '@/domain/auth/lockout-policy';
import { MIN_PASSWORD_LENGTH } from '@/domain/auth/password-policy';
import { RECOVERY_CODE_COUNT } from '@/domain/auth/recovery-code';
import { SESSION_LIFETIME_MS } from '@/domain/auth/session-policy';
import { TRUSTED_DEVICE_TTL_MS } from '@/domain/auth/trusted-device-policy';
import { searchHelp, type HelpIndexEntry } from '@/domain/docs/search';
import { HELP_INDEX } from '@/domain/docs/search-index.generated';
import { formatRetention } from '@/domain/legal/privacy-notice';
import { LAST_REMINDER_LEVEL } from '@/domain/reminder/dunning';

const contentDir = path.join(fileURLToPath(new URL('../../..', import.meta.url)), 'src/content/hilfe');

const INDEX: readonly HelpIndexEntry[] = [
  {
    topicId: 'mahnungen',
    topicTitle: 'Mahnungen',
    heading: 'Mahnungen',
    text: 'Zu einer überfälligen, offenen Rechnung lässt sich eine Mahnung ausstellen.',
  },
  {
    topicId: 'zahlungen',
    topicTitle: 'Zahlungen',
    heading: 'Zahlungen',
    text: 'Zahlungen werden einzeln erfasst; der Status folgt daraus.',
  },
];

describe('FA-DOC-03 Die Suche', () => {
  it('findet über die Groß- und Kleinschreibung hinweg', () => {
    expect(searchHelp(INDEX, 'MAHNUNG')).toHaveLength(1);
    expect(searchHelp(INDEX, 'mahnung')[0]?.topicId).toBe('mahnungen');
  });

  it('findet über Umlaute hinweg', () => {
    // „uberfallig" ohne Umlaute findet „überfällig" — der häufige Fall beim
    // Tippen ohne deutsche Tastatur.
    expect(searchHelp(INDEX, 'uberfalligen')).toHaveLength(1);
  });

  it('sucht nach allen Wörtern, nicht nach einem beliebigen', () => {
    // Jedes weitere Wort macht die Anfrage enger. Das ist die Erwartung, die
    // jemand aus jeder Suchmaske mitbringt.
    expect(searchHelp(INDEX, 'mahnung rechnung')).toHaveLength(1);
    expect(searchHelp(INDEX, 'mahnung sonnenschein')).toHaveLength(0);
  });

  it('findet auch über Titel und Überschrift', () => {
    // Wer „Zahlungen" sucht, soll den Abschnitt finden, ohne dass das Wort
    // zufällig im Fließtext steht.
    expect(searchHelp(INDEX, 'Zahlungen')).toHaveLength(1);
  });

  it('liefert bei leerer Anfrage nichts, statt alles', () => {
    expect(searchHelp(INDEX, '')).toEqual([]);
    expect(searchHelp(INDEX, '   ')).toEqual([]);
  });

  it('sucht im ausgelieferten Index und findet die Mahnungen', () => {
    const treffer = searchHelp(HELP_INDEX, 'mahngebühr');

    /*
     * Geprüft wird das Enthaltensein, nicht die Reihenfolge: Die Mahngebühr
     * steht auch in den Firmendaten, wo sie hinterlegt wird — beide Treffer
     * sind richtig, und eine Rangfolge behauptet dieser Baustein nicht.
     */
    expect(treffer.length).toBeGreaterThan(0);
    expect(treffer.map((entry) => entry.topicId)).toContain('mahnungen');
    expect(treffer.every((entry) => entry.excerpt.length > 0)).toBe(true);
  });
});

describe('FA-DOC-06 Die Neuerungen stehen im Handbuch', () => {
  it('sind durchsuchbar wie jedes andere Thema', () => {
    // Der Eintrag zum Mahnwesen soll auffindbar sein, ohne dass jemand weiß,
    // wann er dazugekommen ist.
    const treffer = searchHelp(HELP_INDEX, 'zahlungserinnerung');

    expect(treffer.map((entry) => entry.topicId)).toContain('neuerungen');
  });
});

describe('FA-DOC-02 Das Handbuch nennt keine abgeschriebene Zahl', () => {
  async function sources(): Promise<string> {
    const files = (await readdir(contentDir)).filter((name) => name.endsWith('.mdx'));
    const parts = await Promise.all(
      files.map(async (name) => readFile(path.join(contentDir, name), 'utf8')),
    );
    return parts.join('\n');
  }

  it.each([
    ['MIN_PASSWORD_LENGTH', String(MIN_PASSWORD_LENGTH)],
    ['MAX_FAILED_LOGINS', String(MAX_FAILED_LOGINS)],
    ['RECOVERY_CODE_COUNT', String(RECOVERY_CODE_COUNT)],
    ['LAST_REMINDER_LEVEL', String(LAST_REMINDER_LEVEL)],
  ])('setzt %s ein, statt %s zu schreiben', async (name, _wert) => {
    const source = await sources();

    // Die Konstante wird importiert und eingesetzt — nicht ihr Wert getippt.
    expect(source).toContain(name);
  });

  it.each([
    ['SESSION_LIFETIME_MS', formatRetention(SESSION_LIFETIME_MS)],
    ['LOCKOUT_DURATION_MS', formatRetention(LOCKOUT_DURATION_MS)],
    ['TRUSTED_DEVICE_TTL_MS', formatRetention(TRUSTED_DEVICE_TTL_MS)],
  ])('nennt die Frist aus %s nicht als Text („%s")', async (name, frist) => {
    const source = await sources();

    expect(source).toContain(name);
    /*
     * Und der ausformulierte Wert steht **nicht** da. Das ist die Richtung, die
     * wirklich schützt: Ein `{formatRetention(...)}` daneben hilft nichts, wenn
     * an anderer Stelle „7 Tage" ausgeschrieben wurde und dort stehen bleibt.
     */
    expect(source).not.toContain(frist);
  });
});
