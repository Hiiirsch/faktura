/**
 * Statusmodell, Zahlungen und Umsatzrelevanz
 * (FA-STAT-01 bis -05, FA-STAT-02 abgeleitete Überfälligkeit, FA-DASH-04).
 *
 * Tests zuerst (Vorgabe für M3).
 */
import { describe, expect, it } from 'vitest';

import { cents } from '@/domain/money/money';
import { plainDate } from '@/domain/time/plain-date';
import {
  allowedTransitionsFrom,
  canTransition,
  daysOverdue,
  deriveStatus,
  INVOICE_STATUSES,
  isInvoiceStatus,
  isOpenReceivable,
  isOverdue,
  outstandingAmount,
  acceptsPayments,
  canBeCancelled,
} from '@/domain/invoice/status';
import { countsTowardReceivables, countsTowardRevenue } from '@/domain/invoice/revenue';
import { INVOICE_EVENT_TYPES } from '@/domain/invoice/events';

describe('Statuswerte (FA-STAT-01)', () => {
  it('kennt genau die fünf vorgesehenen Zustände', () => {
    expect([...INVOICE_STATUSES]).toEqual([
      'DRAFT',
      'ISSUED',
      'PARTIALLY_PAID',
      'PAID',
      'CANCELLED',
    ]);
  });

  it('führt keinen Zustand für Überfälligkeit (FA-STAT-02)', () => {
    expect(INVOICE_STATUSES).not.toContain('OVERDUE');
  });
});

describe('Statusableitung aus Zahlungen (FA-STAT-04, -05)', () => {
  const gross = cents(11_900);

  it('bleibt ohne Zahlung offen', () => {
    expect(deriveStatus({ isCancelled: false, grossTotalCents: gross, paidTotalCents: cents(0) }))
      .toBe('ISSUED');
  });

  it('wechselt bei Teilzahlung auf teilbezahlt (FA-STAT-04)', () => {
    expect(
      deriveStatus({ isCancelled: false, grossTotalCents: gross, paidTotalCents: cents(5_000) }),
    ).toBe('PARTIALLY_PAID');
  });

  it('wechselt bei vollständiger Zahlung auf bezahlt (FA-STAT-05)', () => {
    expect(
      deriveStatus({ isCancelled: false, grossTotalCents: gross, paidTotalCents: gross }),
    ).toBe('PAID');
  });

  it('gilt auch bei Überzahlung als bezahlt', () => {
    expect(
      deriveStatus({ isCancelled: false, grossTotalCents: gross, paidTotalCents: cents(20_000) }),
    ).toBe('PAID');
  });

  it('behandelt einen Bruttobetrag von null als bezahlt', () => {
    expect(
      deriveStatus({ isCancelled: false, grossTotalCents: cents(0), paidTotalCents: cents(0) }),
    ).toBe('PAID');
  });

  it('setzt Storno über jede Zahlungslage', () => {
    expect(
      deriveStatus({ isCancelled: true, grossTotalCents: gross, paidTotalCents: gross }),
    ).toBe('CANCELLED');
    expect(
      deriveStatus({ isCancelled: true, grossTotalCents: gross, paidTotalCents: cents(0) }),
    ).toBe('CANCELLED');
  });

  it('leitet den Restbetrag ab', () => {
    expect(outstandingAmount(gross, cents(5_000))).toBe(6_900);
    expect(outstandingAmount(gross, gross)).toBe(0);
    // Überzahlung ergibt keinen negativen Restbetrag.
    expect(outstandingAmount(gross, cents(20_000))).toBe(0);
  });
});

describe('Statusübergänge', () => {
  it('erlaubt das Festschreiben eines Entwurfs', () => {
    expect(canTransition('DRAFT', 'ISSUED')).toBe(true);
  });

  it('verbietet den Rückweg in den Entwurf', () => {
    for (const from of ['ISSUED', 'PARTIALLY_PAID', 'PAID', 'CANCELLED'] as const) {
      expect(canTransition(from, 'DRAFT'), from).toBe(false);
    }
  });

  it('erlaubt Zahlungswege in beide Richtungen — Zahlungen sind korrigierbar', () => {
    expect(canTransition('ISSUED', 'PARTIALLY_PAID')).toBe(true);
    expect(canTransition('PARTIALLY_PAID', 'PAID')).toBe(true);
    expect(canTransition('PAID', 'PARTIALLY_PAID')).toBe(true);
    expect(canTransition('PARTIALLY_PAID', 'ISSUED')).toBe(true);
  });

  it('erlaubt Storno aus jedem festgeschriebenen Zustand (FA-STAT-10)', () => {
    for (const from of ['ISSUED', 'PARTIALLY_PAID', 'PAID'] as const) {
      expect(canTransition(from, 'CANCELLED'), from).toBe(true);
    }
  });

  it('verbietet jeden Weg aus dem Storno heraus', () => {
    for (const to of INVOICE_STATUSES) {
      expect(canTransition('CANCELLED', to), to).toBe(false);
    }
  });

  it('verbietet den Sprung vom Entwurf in eine Zahlungslage', () => {
    expect(canTransition('DRAFT', 'PAID')).toBe(false);
    expect(canTransition('DRAFT', 'PARTIALLY_PAID')).toBe(false);
    expect(canTransition('DRAFT', 'CANCELLED')).toBe(false);
  });
});

describe('Überfälligkeit ist abgeleitet (FA-STAT-02)', () => {
  const today = plainDate('2026-03-15');

  it('gilt für offene Belege mit vergangenem Fälligkeitsdatum', () => {
    expect(isOverdue('ISSUED', plainDate('2026-03-14'), today)).toBe(true);
    expect(isOverdue('PARTIALLY_PAID', plainDate('2026-03-14'), today)).toBe(true);
  });

  it('gilt am Fälligkeitstag selbst noch nicht', () => {
    expect(isOverdue('ISSUED', plainDate('2026-03-15'), today)).toBe(false);
  });

  it('gilt nie für bezahlte, stornierte oder entworfene Belege', () => {
    for (const status of ['PAID', 'CANCELLED', 'DRAFT'] as const) {
      expect(isOverdue(status, plainDate('2026-01-01'), today), status).toBe(false);
    }
  });

  it('gilt ohne Fälligkeitsdatum nicht', () => {
    expect(isOverdue('ISSUED', null, today)).toBe(false);
  });
});

describe('Offene Forderung', () => {
  it('zählt offene und teilbezahlte Belege', () => {
    expect(isOpenReceivable('ISSUED')).toBe(true);
    expect(isOpenReceivable('PARTIALLY_PAID')).toBe(true);
  });

  it('zählt Entwürfe, bezahlte und stornierte Belege nicht', () => {
    expect(isOpenReceivable('DRAFT')).toBe(false);
    expect(isOpenReceivable('PAID')).toBe(false);
    expect(isOpenReceivable('CANCELLED')).toBe(false);
  });
});

describe('Umsatzrelevanz (FA-DASH-04)', () => {
  it('zählt festgeschriebene Rechnungen', () => {
    for (const status of ['ISSUED', 'PARTIALLY_PAID', 'PAID'] as const) {
      expect(countsTowardRevenue({ documentType: 'INVOICE', status }), status).toBe(true);
    }
  });

  it('zählt Entwürfe und stornierte Rechnungen nicht', () => {
    expect(countsTowardRevenue({ documentType: 'INVOICE', status: 'DRAFT' })).toBe(false);
    expect(countsTowardRevenue({ documentType: 'INVOICE', status: 'CANCELLED' })).toBe(false);
  });

  it('zählt Gutschriften nicht — sonst würde der Betrag zweimal abgezogen', () => {
    // Die Neutralisierung geschieht dadurch, dass das Original auf CANCELLED
    // wechselt und damit ausscheidet. Zählte die Gutschrift zusätzlich negativ,
    // fehlte der Betrag ein zweites Mal.
    for (const status of INVOICE_STATUSES) {
      expect(countsTowardRevenue({ documentType: 'CREDIT_NOTE', status }), status).toBe(false);
    }
  });

  it('lässt Storno den Umsatz exakt auf den Ausgangswert zurückfallen', () => {
    const documents = [
      { documentType: 'INVOICE' as const, status: 'PAID' as const, netCents: 100_000 },
      { documentType: 'INVOICE' as const, status: 'PAID' as const, netCents: 50_000 },
    ];

    const before = documents
      .filter(countsTowardRevenue)
      .reduce((total, document) => total + document.netCents, 0);
    expect(before).toBe(150_000);

    // Storno der ersten Rechnung: Original auf CANCELLED, Gutschrift kommt
    // als eigenes Dokument mit positiven Beträgen hinzu.
    const afterCancellation = [
      { documentType: 'INVOICE' as const, status: 'CANCELLED' as const, netCents: 100_000 },
      { documentType: 'INVOICE' as const, status: 'PAID' as const, netCents: 50_000 },
      { documentType: 'CREDIT_NOTE' as const, status: 'ISSUED' as const, netCents: 100_000 },
    ];

    const after = afterCancellation
      .filter(countsTowardRevenue)
      .reduce((total, document) => total + document.netCents, 0);

    expect(after).toBe(50_000);
  });
});

describe('Hilfsfunktionen des Statusmodells', () => {
  it('erkennt gültige Statuswerte', () => {
    expect(isInvoiceStatus('ISSUED')).toBe(true);
    expect(isInvoiceStatus('OVERDUE')).toBe(false);
    expect(isInvoiceStatus('')).toBe(false);
  });

  it('nennt die erlaubten Folgezustände', () => {
    expect([...allowedTransitionsFrom('DRAFT')]).toEqual(['ISSUED']);
    expect([...allowedTransitionsFrom('CANCELLED')]).toEqual([]);
    expect(allowedTransitionsFrom('ISSUED')).toContain('CANCELLED');
  });

  it('zählt die Tage seit Fälligkeit — für die Sortierung der Mahnliste', () => {
    const today = plainDate('2026-03-15');
    expect(daysOverdue(plainDate('2026-03-14'), today)).toBe(1);
    expect(daysOverdue(plainDate('2026-02-15'), today)).toBe(28);
    expect(daysOverdue(plainDate('2026-03-15'), today)).toBe(0);
    expect(daysOverdue(plainDate('2026-04-01'), today)).toBe(0);
    expect(daysOverdue(null, today)).toBe(0);
  });
});

describe('Offene Forderungen für das Dashboard (FA-DASH-01)', () => {
  it('zählt offene und teilbezahlte Rechnungen', () => {
    expect(countsTowardReceivables({ documentType: 'INVOICE', status: 'ISSUED' })).toBe(true);
    expect(countsTowardReceivables({ documentType: 'INVOICE', status: 'PARTIALLY_PAID' })).toBe(
      true,
    );
  });

  it('zählt bezahlte, stornierte und entworfene Belege nicht', () => {
    for (const status of ['PAID', 'CANCELLED', 'DRAFT'] as const) {
      expect(countsTowardReceivables({ documentType: 'INVOICE', status }), status).toBe(false);
    }
  });

  it('zählt Gutschriften nicht', () => {
    expect(countsTowardReceivables({ documentType: 'CREDIT_NOTE', status: 'ISSUED' })).toBe(false);
  });
});

describe('Domain-Ereignisse (NFA-ARCH-08)', () => {
  it('führt die Ereignisse, an die sich Handler hängen lassen', () => {
    expect([...INVOICE_EVENT_TYPES]).toEqual([
      'InvoiceIssued',
      'InvoicePaymentRecorded',
      'InvoicePaid',
      'InvoiceCancelled',
    ]);
  });
});

describe('FA-STAT-04 Was ein Beleg noch zulässt (M12)', () => {
  /*
   * Beide Regeln gab es schon — in `cancelInvoice` und in `addPayment`, als
   * Reihe von Abweisungen. Die Oberfläche kannte sie nicht und bot beides an,
   * sobald der Status „ausgestellt" war: Man konnte eine **Stornorechnung
   * stornieren**. Der Server wies es ab, und sichtbar geschah nichts.
   */
  it('lässt eine ausgestellte Rechnung stornieren', () => {
    expect(canBeCancelled('ISSUED', 'INVOICE')).toBe(true);
    expect(canBeCancelled('PARTIALLY_PAID', 'INVOICE')).toBe(true);
    expect(canBeCancelled('PAID', 'INVOICE')).toBe(true);
  });

  it('lässt eine Stornorechnung nicht stornieren — sie ist das Storno', () => {
    expect(canBeCancelled('ISSUED', 'CREDIT_NOTE')).toBe(false);
    expect(canBeCancelled('PAID', 'CREDIT_NOTE')).toBe(false);
  });

  it('lässt weder Entwurf noch bereits stornierten Beleg stornieren', () => {
    expect(canBeCancelled('DRAFT', 'INVOICE')).toBe(false);
    expect(canBeCancelled('CANCELLED', 'INVOICE')).toBe(false);
  });

  it('nimmt auf eine Gutschrift keine Zahlung an — sie erstattet', () => {
    expect(acceptsPayments('ISSUED', 'CREDIT_NOTE')).toBe(false);
    expect(acceptsPayments('ISSUED', 'INVOICE')).toBe(true);
  });

  it('nimmt weder auf einen Entwurf noch auf einen Storno eine Zahlung an', () => {
    expect(acceptsPayments('DRAFT', 'INVOICE')).toBe(false);
    expect(acceptsPayments('CANCELLED', 'INVOICE')).toBe(false);
  });
});
