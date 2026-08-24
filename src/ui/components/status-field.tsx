/**
 * Statusdarstellung (Frontend-Entwurf §6; FA-UI-05, FA-UI-06).
 *
 * Zwei Zusagen stecken hier drin, und beide sind der Grund, warum das ein
 * eigener Baustein ist statt einer Klassenliste an Ort und Stelle:
 *
 * 1. **Nie Farbe allein.** Jedes Feld trägt Text, und die Punktform
 *    unterscheidet sich zusätzlich — offen, halb, gefüllt. Das ist zugleich
 *    Barrierefreiheit und Druckbarkeit: Ein ausgedruckter Beleg in Graustufen
 *    bleibt lesbar.
 * 2. **Überfälligkeit ist kein Status**, sondern ein Zusatz am Status „Offen"
 *    (FA-STAT-02, FA-UI-06). Sie erscheint als Nachsatz, nicht als eigene
 *    Beschriftung.
 */
import type { ReactNode } from 'react';

import type { CurrencyCode } from '@/domain/codes/currency-code';
import { formatMoneyDe } from '@/domain/format/de';
import type { InvoiceStatus } from '@/domain/invoice/status';
import type { Cents } from '@/domain/money/money';
import { messages } from '@/i18n/de';

type DotShape = 'open' | 'half' | 'filled';

/**
 * Der Punkt als SVG statt als runder `div`.
 *
 * Die halbe Füllung ist der Grund: Sie über Farbverläufe zu bauen, hielte
 * weder dem Druck noch dem Kontrastmodus stand. Als Pfad ist sie eine Form,
 * kein Farbeffekt.
 */
function StatusDot({ shape }: { readonly shape: DotShape }): ReactNode {
  return (
    <svg viewBox="0 0 10 10" aria-hidden="true" className="size-3 shrink-0">
      <circle
        cx="5"
        cy="5"
        r="4"
        fill={shape === 'filled' ? 'currentColor' : 'none'}
        stroke="currentColor"
        strokeWidth="1.5"
      />
      {shape === 'half' ? <path d="M5 1 A4 4 0 0 0 5 9 Z" fill="currentColor" /> : null}
    </svg>
  );
}

type Appearance = {
  readonly shape: DotShape;
  /** Punktfarbe. */
  readonly tone: string;
  /** Hinterlegte Fläche — nur dort, wo §6 eine vorsieht. */
  readonly wash: string;
};

const APPEARANCE: Readonly<Record<InvoiceStatus, Appearance>> = {
  DRAFT: { shape: 'open', tone: 'text-ink-faint', wash: '' },
  ISSUED: { shape: 'filled', tone: 'text-accent', wash: '' },
  PARTIALLY_PAID: { shape: 'half', tone: 'text-accent', wash: '' },
  PAID: { shape: 'filled', tone: 'text-moss', wash: 'bg-moss-wash' },
  CANCELLED: { shape: 'filled', tone: 'text-ink-faint', wash: 'bg-surface-sunken' },
};

const OVERDUE_APPEARANCE: Appearance = {
  shape: 'filled',
  tone: 'text-ocker',
  wash: 'bg-ocker-wash',
};

const LABEL: Readonly<Record<InvoiceStatus, string>> = {
  DRAFT: messages.invoices.statusDRAFT,
  ISSUED: messages.invoices.statusISSUED,
  PARTIALLY_PAID: messages.invoices.statusPARTIALLY_PAID,
  PAID: messages.invoices.statusPAID,
  CANCELLED: messages.invoices.statusCANCELLED,
};

export type InvoiceStatusViewModel = {
  readonly status: InvoiceStatus;
  /**
   * Der Belegtyp entscheidet mit (M12).
   *
   * **„Offen" heißt: Da steht Geld aus.** Für eine Stornorechnung stimmt das
   * nicht — sie stellt keine Forderung, sie nimmt eine zurück. Der Beleg ist
   * ausgestellt und damit fertig; auf ihn wird nichts gezahlt, und deshalb
   * kann er auch nicht überfällig werden. Ein „Offen" an einer Gutschrift ist
   * keine Kleinigkeit: Es lässt eine Zahlung erwarten, die niemand leisten
   * wird, und in einer Liste sieht es aus wie ein unbezahlter Beleg.
   *
   * Fehlt die Angabe, gilt der Regelfall — Bestandsaufrufe bleiben gültig.
   */
  readonly documentType?: 'INVOICE' | 'CREDIT_NOTE';
  readonly isOverdue: boolean;
  /** Tage seit der Fälligkeit; `null`, sobald der Beleg nicht überfällig ist. */
  readonly daysOverdue: number | null;
  readonly paidTotalCents: Cents;
  readonly grossTotalCents: Cents;
  readonly currency: CurrencyCode;
};

/**
 * Der Nachsatz hinter dem Status.
 *
 * Er trägt die Information, die den Status erst handhabbar macht: wie lange
 * überfällig, wie viel bereits bezahlt. Ohne ihn müsste man in die Zeile
 * daneben schauen.
 */
function detail(view: InvoiceStatusViewModel): string | null {
  // Eine Stornorechnung wird nicht überfällig — sie fordert nichts.
  if (view.documentType === 'CREDIT_NOTE') {
    return null;
  }
  if (view.isOverdue && view.daysOverdue !== null) {
    return messages.invoices.overdueSince(view.daysOverdue);
  }
  if (view.status === 'PARTIALLY_PAID') {
    return messages.invoices.paidOf(
      formatMoneyDe(view.paidTotalCents, view.currency),
      formatMoneyDe(view.grossTotalCents, view.currency),
    );
  }
  return null;
}

/**
 * Ob der Beleg als überfällig dargestellt wird.
 *
 * Als eigene Funktion, weil hier eine Zusage steckt und keine Formatierung:
 * Eine **Stornorechnung wird nie überfällig** — sie fordert nichts. Ebenso
 * wenig ein bezahlter oder stornierter Beleg.
 */
export function showsOverdue(view: InvoiceStatusViewModel): boolean {
  return (
    view.isOverdue &&
    view.documentType !== 'CREDIT_NOTE' &&
    view.status !== 'CANCELLED' &&
    view.status !== 'PAID'
  );
}

/**
 * Die Beschriftung des Status.
 *
 * „Offen" heißt: Da steht Geld aus. Eine ausgestellte Stornorechnung ist
 * deshalb **ausgestellt**, nicht offen.
 */
export function statusLabel(view: InvoiceStatusViewModel): string {
  if (view.documentType === 'CREDIT_NOTE' && view.status === 'ISSUED') {
    return messages.invoices.statusIssuedCreditNote;
  }
  return LABEL[view.status];
}

export function InvoiceStatusField(view: InvoiceStatusViewModel): ReactNode {
  const overdue = showsOverdue(view);
  const appearance = overdue ? OVERDUE_APPEARANCE : APPEARANCE[view.status];
  const suffix = detail(view);

  return (
    <span
      className={
        `inline-flex items-center gap-2 rounded-control px-2 py-1 text-ui ${appearance.tone} ` +
        appearance.wash
      }
    >
      <StatusDot shape={appearance.shape} />
      <span className="text-ink">
        {statusLabel(view)}
        {suffix === null ? null : <span className="text-ink-muted"> · {suffix}</span>}
      </span>
    </span>
  );
}
