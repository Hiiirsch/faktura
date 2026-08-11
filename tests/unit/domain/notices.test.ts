/**
 * Pflichthinweise (FA-CALC-05, -06; FA-PFL-08, -09, -11).
 */
import { describe, expect, it } from 'vitest';

import { buildNotices, buildPaymentTermsNotice, type NoticeInput } from '@/domain/document/notices';

function input(overrides: Partial<NoticeInput> = {}): NoticeInput {
  return {
    documentType: 'INVOICE',
    taxScheme: 'STANDARD',
    sellerVatId: 'DE123456789',
    buyerVatId: null,
    precedingInvoiceNumber: null,
    ...overrides,
  };
}

describe('Steuerliche Hinweise', () => {
  it('gibt im Regelfall keinen Hinweis aus', () => {
    expect(buildNotices(input())).toEqual([]);
  });

  it('nennt die Kleinunternehmerregelung mit Paragraf (FA-CALC-05)', () => {
    const notices = buildNotices(input({ taxScheme: 'SMALL_BUSINESS' }));
    expect(notices).toHaveLength(1);
    expect(notices[0]).toContain('§19 UStG');
  });

  it('nennt die Steuerschuldnerschaft des Leistungsempfängers (FA-CALC-06)', () => {
    const notices = buildNotices(
      input({ taxScheme: 'REVERSE_CHARGE', buyerVatId: 'ATU12345678' }),
    );
    expect(notices[0]).toContain('Steuerschuldnerschaft des Leistungsempfängers');
  });

  it('weist bei Reverse Charge beide USt-IdNr aus (FA-PFL-09)', () => {
    const notices = buildNotices(
      input({ taxScheme: 'REVERSE_CHARGE', buyerVatId: 'ATU12345678' }),
    );
    const combined = notices.join(' ');
    expect(combined).toContain('DE123456789');
    expect(combined).toContain('ATU12345678');
  });

  it('lässt die Nummernzeile weg, wenn eine der beiden fehlt', () => {
    const notices = buildNotices(input({ taxScheme: 'REVERSE_CHARGE', buyerVatId: null }));
    expect(notices).toHaveLength(1);
    expect(notices[0]).not.toContain('USt-IdNr. Aussteller');
  });

  it('nennt die Ausfuhrlieferung', () => {
    expect(buildNotices(input({ taxScheme: 'EXPORT' }))[0]).toContain('Ausfuhrlieferung');
  });
});

describe('Stornobezug (FA-PFL-11)', () => {
  it('nennt die Nummer der stornierten Rechnung', () => {
    const notices = buildNotices(
      input({ documentType: 'CREDIT_NOTE', precedingInvoiceNumber: 'RE-2026-0001' }),
    );
    expect(notices.at(-1)).toContain('RE-2026-0001');
  });

  it('nennt sie nur bei einer Gutschrift', () => {
    const notices = buildNotices(
      input({ documentType: 'INVOICE', precedingInvoiceNumber: 'RE-2026-0001' }),
    );
    expect(notices.join(' ')).not.toContain('Storno zur Rechnung');
  });

  it('verbindet Verfahren und Stornobezug', () => {
    const notices = buildNotices(
      input({
        documentType: 'CREDIT_NOTE',
        taxScheme: 'SMALL_BUSINESS',
        precedingInvoiceNumber: 'RE-2026-0007',
      }),
    );
    expect(notices).toHaveLength(2);
    expect(notices[0]).toContain('§19 UStG');
    expect(notices[1]).toContain('RE-2026-0007');
  });
});

describe('Zahlungshinweis (FA-PFL-10)', () => {
  it('nennt das Fälligkeitsdatum in deutscher Schreibweise', () => {
    expect(buildPaymentTermsNotice('2026-03-15', false)).toBe(
      'Zahlbar ohne Abzug bis zum 15.03.2026.',
    );
  });

  it('entfällt bei einer Gutschrift — sie ist nicht zahlbar', () => {
    expect(buildPaymentTermsNotice('2026-03-15', true)).toBeNull();
  });

  it('entfällt ohne Fälligkeitsdatum', () => {
    expect(buildPaymentTermsNotice(null, false)).toBeNull();
  });
});
