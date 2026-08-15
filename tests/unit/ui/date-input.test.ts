/**
 * Direkteingabe im Datumsfeld (FA-UI-13).
 *
 * Der Grund für diese Umrechnung steht im Kopf von
 * `src/ui/components/date-field.tsx`: Das Anzeigeformat von `<input
 * type="date">` folgt der Spracheinstellung des Betriebssystems, nicht der der
 * Anwendung. Wer auf einem englisch eingerichteten Rechner `03.09.2026` tippt,
 * hat den 9. März erfasst — bei einem Rechnungsdatum ist das kein
 * Schönheitsfehler.
 *
 * Geprüft wird deshalb beides: was angenommen wird und was ausdrücklich nicht.
 */
import { describe, expect, it } from 'vitest';

import { formatPlainDateDe, parsePlainDateDe } from '@/domain/format/de';
import { parsePlainDate } from '@/domain/time/plain-date';

describe('FA-UI-13 Deutsche Datumseingabe', () => {
  it('liest die vollständige Schreibweise', () => {
    expect(parsePlainDateDe('01.03.2026')).toBe('2026-03-01');
    expect(parsePlainDateDe('  15.08.2026  ')).toBe('2026-08-15');
  });

  it('ist nachsichtig bei ein- statt zweistelligen Angaben', () => {
    expect(parsePlainDateDe('1.3.2026')).toBe('2026-03-01');
    expect(parsePlainDateDe('9.12.2026')).toBe('2026-12-09');
  });

  it('nimmt die üblichen Trennzeichen an', () => {
    expect(parsePlainDateDe('01-03-2026')).toBe('2026-03-01');
    expect(parsePlainDateDe('01/03/2026')).toBe('2026-03-01');
  });

  it('ergänzt eine zweistellige Jahreszahl zu diesem Jahrhundert', () => {
    expect(parsePlainDateDe('01.03.26')).toBe('2026-03-01');
  });

  it('gibt bei unvollständiger Eingabe nichts zurück statt zu raten', () => {
    // Wer „1.2" tippt, ist mitten im Schreiben — ihm den 1. Februar
    // zuzuweisen wäre schlimmer als keine Antwort.
    expect(parsePlainDateDe('1.2')).toBeNull();
    expect(parsePlainDateDe('')).toBeNull();
    expect(parsePlainDateDe('morgen')).toBeNull();
    expect(parsePlainDateDe('2026-03-01')).toBeNull();
  });

  it('überlässt die Gültigkeitsprüfung dem Kalender', () => {
    // Die Form stimmt, der Tag existiert nicht. Das entscheidet
    // `parsePlainDate`, nicht die Umrechnung der Schreibweise.
    const candidate = parsePlainDateDe('31.02.2026');
    expect(candidate).toBe('2026-02-31');
    expect(parsePlainDate(candidate ?? '').ok).toBe(false);
  });

  it('ist die Umkehrung der Anzeige', () => {
    for (const iso of ['2026-01-01', '2026-12-31', '2026-08-15']) {
      expect(parsePlainDateDe(formatPlainDateDe(iso))).toBe(iso);
    }
  });
});
