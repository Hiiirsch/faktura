/**
 * Der Empfänger eines Belegs (FA-PFL-01, FA-RECH-02, M5.7).
 *
 * **Der Anzeigename ist die Stelle, an der es interessant wird.** Im freien
 * Modus wird er **nicht gespeichert**, sondern beim Lesen aus der ersten
 * nichtleeren Zeile gewonnen. Ihn zusätzlich abzulegen hieße, zwei Wahrheiten
 * zu pflegen — und die zweite wäre die, die nach einer Korrektur nicht mehr
 * stimmt. Diese Regel stand in `CLAUDE.md` und in keinem Test.
 */
import { describe, expect, it } from 'vitest';

import {
  buyerDisplayName,
  type DraftBuyer,
  EMPTY_BUYER_FIELDS,
  freeTextLines,
  isBuyerMode,
} from '@/domain/invoice/buyer';

function buyer(overrides: Partial<DraftBuyer> = {}): DraftBuyer {
  return {
    mode: 'CUSTOMER',
    customerId: null,
    fields: EMPTY_BUYER_FIELDS,
    freeText: null,
    ...overrides,
  };
}

describe('isBuyerMode', () => {
  it('nimmt die drei Modi an', () => {
    expect(isBuyerMode('CUSTOMER')).toBe(true);
    expect(isBuyerMode('FIELDS')).toBe(true);
    expect(isBuyerMode('FREE')).toBe(true);
  });

  it('weist alles andere ab — die Eingabe kommt aus einem Formular', () => {
    expect(isBuyerMode('')).toBe(false);
    expect(isBuyerMode('customer')).toBe(false);
    expect(isBuyerMode('ADMIN')).toBe(false);
  });
});

describe('freeTextLines', () => {
  it('wirft leere Zeilen weg', () => {
    // Eine Leerzeile im Anschriftfeld wäre im Umschlagfenster eine
    // verschenkte Zeile — gemeint ist sie fast nie.
    expect(freeTextLines('Max Mustermann\n\n  \nMusterstr. 1')).toEqual([
      'Max Mustermann',
      'Musterstr. 1',
    ]);
  });

  it('versteht beide Zeilenenden', () => {
    expect(freeTextLines('Erste\r\nZweite')).toEqual(['Erste', 'Zweite']);
  });

  it('macht aus nichts eine leere Liste', () => {
    expect(freeTextLines(null)).toEqual([]);
    expect(freeTextLines('   \n  ')).toEqual([]);
  });
});

describe('FA-RECH-02 Der Anzeigename des Empfängers', () => {
  it('kommt im Kundenmodus aus den Stammdaten', () => {
    expect(buyerDisplayName(buyer({ mode: 'CUSTOMER' }), 'Beispiel GmbH')).toBe('Beispiel GmbH');
  });

  it('ist im Kundenmodus ohne Kunden leer', () => {
    expect(buyerDisplayName(buyer({ mode: 'CUSTOMER' }), null)).toBeNull();
  });

  it('kommt im Feldmodus aus dem Namensfeld', () => {
    const am_beleg = buyer({
      mode: 'FIELDS',
      fields: { ...EMPTY_BUYER_FIELDS, name: 'Stadtverwaltung' },
    });

    expect(buyerDisplayName(am_beleg, 'wird ignoriert')).toBe('Stadtverwaltung');
  });

  it('ist im freien Modus die **erste** Zeile des Blocks', () => {
    const frei = buyer({ mode: 'FREE', freeText: 'Landratsamt\nAmt für Vermessung\n89522 Heidenheim' });

    expect(buyerDisplayName(frei, null)).toBe('Landratsamt');
  });

  it('überspringt dabei führende Leerzeilen', () => {
    const frei = buyer({ mode: 'FREE', freeText: '\n   \nLandratsamt\n89522 Heidenheim' });

    expect(buyerDisplayName(frei, null)).toBe('Landratsamt');
  });

  it('ist bei leerem Block leer statt einer leeren Zeichenkette', () => {
    expect(buyerDisplayName(buyer({ mode: 'FREE', freeText: '  ' }), null)).toBeNull();
  });
});
