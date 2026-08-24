/**
 * Der Status einer Stornorechnung (M12 — FA-UI-05, FA-UI-06, FA-STAT-02).
 *
 * **„Offen" heißt: Da steht Geld aus.** Für eine Stornorechnung stimmt das
 * nicht — sie stellt keine Forderung, sie nimmt eine zurück. Sie ist
 * ausgestellt und damit fertig; auf sie wird nichts gezahlt, und deshalb kann
 * sie auch nicht überfällig werden. Ein „12 Tage überfällig" an einer
 * Gutschrift wäre eine Mahnung an sich selbst.
 *
 * Geprüft werden die beiden reinen Funktionen, nicht das Markup: In ihnen
 * steckt die Zusage, der Rest ist Darstellung.
 */
import { describe, expect, it } from 'vitest';

import { cents } from '@/domain/money/money';
import {
  showsOverdue,
  statusLabel,
  type InvoiceStatusViewModel,
} from '@/ui/components/status-field';

function view(overrides: Partial<InvoiceStatusViewModel> = {}): InvoiceStatusViewModel {
  return {
    status: 'ISSUED',
    isOverdue: false,
    daysOverdue: null,
    paidTotalCents: cents(0),
    grossTotalCents: cents(11_900),
    currency: 'EUR',
    ...overrides,
  };
}

describe('FA-UI-05 Status einer Stornorechnung', () => {
  it('nennt eine ausgestellte Rechnung „Offen"', () => {
    expect(statusLabel(view())).toBe('Offen');
  });

  it('nennt eine ausgestellte Stornorechnung „Ausgestellt"', () => {
    expect(statusLabel(view({ documentType: 'CREDIT_NOTE' }))).toBe('Ausgestellt');
  });

  it('lässt die übrigen Beschriftungen unberührt', () => {
    expect(statusLabel(view({ status: 'DRAFT', documentType: 'CREDIT_NOTE' }))).toBe('Entwurf');
    expect(statusLabel(view({ status: 'CANCELLED' }))).toBe('Storniert');
    expect(statusLabel(view({ status: 'PAID' }))).toBe('Bezahlt');
  });
});

describe('FA-STAT-02 Überfälligkeit', () => {
  it('gilt für eine offene Rechnung', () => {
    expect(showsOverdue(view({ isOverdue: true, daysOverdue: 12 }))).toBe(true);
  });

  it('gilt nie für eine Stornorechnung', () => {
    expect(showsOverdue(view({ documentType: 'CREDIT_NOTE', isOverdue: true, daysOverdue: 12 })))
      .toBe(false);
  });

  it('gilt weder für bezahlt noch für storniert', () => {
    expect(showsOverdue(view({ status: 'PAID', isOverdue: true }))).toBe(false);
    expect(showsOverdue(view({ status: 'CANCELLED', isOverdue: true }))).toBe(false);
  });
});
