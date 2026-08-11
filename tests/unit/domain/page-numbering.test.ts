/**
 * FA-PDF-06 — Seitenangabe „Seite X von Y", erst ab Seite 2.
 *
 * Die Regel selbst ist eine Handvoll Zeilen; sie hier durchzuspielen kostet
 * nichts und hält die Zusage fest, um die es dem Auftraggeber ging: Auf einem
 * einseitigen Beleg steht unten nichts.
 */
import { describe, expect, it } from 'vitest';

import {
  FIRST_NUMBERED_PAGE,
  needsPageNumbers,
  numberedPages,
  pageNumberLabel,
} from '@/domain/rendering/page-numbering';

describe('Seitenangabe', () => {
  it('lässt den einseitigen Beleg ohne Angabe', () => {
    expect(needsPageNumbers(1)).toBe(false);
    expect(numberedPages(1)).toEqual([]);
  });

  it('nummeriert ab der zweiten Seite, nicht ab der ersten', () => {
    expect(needsPageNumbers(2)).toBe(true);
    expect(numberedPages(2)).toEqual([2]);
    expect(numberedPages(4)).toEqual([2, 3, 4]);
    expect(FIRST_NUMBERED_PAGE).toBe(2);
  });

  it('nennt in der Angabe immer die Gesamtzahl', () => {
    expect(pageNumberLabel(2, 3)).toBe('Seite 2 von 3');
    expect(pageNumberLabel(12, 12)).toBe('Seite 12 von 12');
  });

  it('kommt mit einem leeren Dokument zurecht', () => {
    expect(needsPageNumbers(0)).toBe(false);
    expect(numberedPages(0)).toEqual([]);
  });
});
