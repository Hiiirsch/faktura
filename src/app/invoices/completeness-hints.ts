/**
 * Was dem Entwurf zum Festschreiben noch fehlt (M12, FA-RECH-12, FA-UI-10).
 *
 * **Warum das im Entwurf steht und nicht erst am Ende.** Die Prüfung gab es
 * seit M3, sie lief nur zu spät: erst beim Festschreiben, als Liste oben im
 * Formular. Wer unten auf den Knopf drückte, bekam eine Absage für Dinge, die
 * seit einer halben Stunde offen waren — und sah sie womöglich gar nicht. Die
 * Prüfung ist dieselbe (`validateForIssue`), nur der Zeitpunkt ist ein anderer.
 *
 * **Dieselbe Quelle, nicht eine zweite.** Es wäre einfach gewesen, im Editor
 * ein paar Felder auf „leer" abzufragen. Dann gäbe es zwei Vorstellungen davon,
 * wann ein Beleg vollständig ist, und die zweite wäre die, die nach einer
 * Gesetzesänderung nicht nachgezogen wird. Der Editor liest deshalb sein
 * eigenes Formular und legt es derselben Domänenfunktion vor, die auch der
 * Server befragt.
 *
 * Gelesen wird über `FormData` und nicht aus React-Zustand: Die Felder des
 * Empfängers und die Datumsfelder sind ungesteuert, und sie dafür alle
 * umzubauen hieße, halb Formular in Zustand zu verwandeln — für eine Anzeige.
 */
import type { DraftBuyer } from '@/domain/invoice/buyer';
import {
  type CompletenessViolation,
  type IssueCandidate,
  validateForIssue,
} from '@/domain/invoice/completeness';
import { isBuyerMode } from '@/domain/invoice/buyer';
import { isTaxCategoryCode } from '@/domain/codes/tax-category';
import { cents } from '@/domain/money/money';
import { parsePlainDate, type PlainDate } from '@/domain/time/plain-date';
import { isTaxScheme, type TaxScheme } from '@/domain/tax/tax-scheme';
import { messages } from '@/i18n/de';

function text(form: FormData, name: string): string {
  const value = form.get(name);
  return typeof value === 'string' ? value.trim() : '';
}

function orNull(value: string): string | null {
  return value.length === 0 ? null : value;
}

function date(form: FormData, name: string): PlainDate | null {
  const raw = text(form, name);
  if (raw.length === 0) {
    return null;
  }
  const parsed = parsePlainDate(raw);
  return parsed.ok ? parsed.value : null;
}

/** Zahl aus einem deutschen Dezimalfeld; unlesbares zählt als null. */
function decimal(value: string): number {
  const normalized = value.replace(/\./g, '').replace(',', '.');
  const parsed = Number(normalized);
  return Number.isFinite(parsed) ? parsed : 0;
}

function buyerFrom(form: FormData): DraftBuyer {
  const mode = text(form, 'buyerMode');

  return {
    mode: isBuyerMode(mode) ? mode : 'CUSTOMER',
    customerId: orNull(text(form, 'customerId')),
    fields: {
      name: orNull(text(form, 'buyerName')),
      contactName: orNull(text(form, 'buyerContactName')),
      addressLine1: orNull(text(form, 'buyerAddressLine1')),
      addressLine2: orNull(text(form, 'buyerAddressLine2')),
      postalCode: orNull(text(form, 'buyerPostalCode')),
      city: orNull(text(form, 'buyerCity')),
      countryCode: orNull(text(form, 'buyerCountryCode')),
      email: orNull(text(form, 'buyerEmail')),
      phone: orNull(text(form, 'buyerPhone')),
      vatId: orNull(text(form, 'buyerVatId')),
    },
    freeText: orNull(text(form, 'buyerFreeText')),
  };
}

/** Die Positionen, wie sie im Formular stehen. */
function linesFrom(form: FormData): IssueCandidate['lines'] {
  const lines: IssueCandidate['lines'][number][] = [];

  for (let index = 0; ; index += 1) {
    const name = form.get(`lines[${String(index)}][name]`);
    if (name === null) {
      break;
    }

    const category = text(form, `lines[${String(index)}][taxCategory]`);

    lines.push({
      name: typeof name === 'string' ? name : '',
      quantityScaled: Math.round(decimal(text(form, `lines[${String(index)}][quantity]`)) * 10_000),
      unitPriceCents: cents(Math.round(decimal(text(form, `lines[${String(index)}][unitPrice]`)) * 100)),
      taxRateBasisPoints: Math.round(decimal(text(form, `lines[${String(index)}][taxRate]`)) * 100),
      taxCategory: isTaxCategoryCode(category) ? category : 'S',
    });
  }

  return lines;
}

export type SellerFacts = {
  readonly hasTaxIdentifier: boolean;
  readonly vatId: string | null;
};

/** Führt die Prüfung des Festschreibens auf dem aktuellen Formularstand aus. */
export function violationsOf(
  form: HTMLFormElement,
  seller: SellerFacts,
): readonly CompletenessViolation[] {
  const data = new FormData(form);
  const scheme = text(data, 'taxScheme');
  const buyer = buyerFrom(data);

  const candidate: IssueCandidate = {
    buyer,
    issueDate: date(data, 'issueDate'),
    serviceDateFrom: date(data, 'serviceDateFrom'),
    serviceDateTo: date(data, 'serviceDateTo'),
    dueDate: date(data, 'dueDate'),
    taxScheme: (isTaxScheme(scheme) ? scheme : 'STANDARD') satisfies TaxScheme,
    lines: linesFrom(data),
    sellerHasTaxIdentifier: seller.hasTaxIdentifier,
    sellerVatId: seller.vatId,
    buyerVatId: orNull(text(data, 'buyerVatId')),
  };

  return validateForIssue(candidate);
}

/**
 * Der Text zu einem Verstoß — derselbe wie in der Absage des Servers.
 *
 * Eine zweite Formulierung für dieselbe Sache wäre eine zweite Wahrheit: Der
 * Hinweis im Entwurf und die Absage beim Festschreiben müssen sich gleich
 * lesen, sonst sucht man den Unterschied.
 */
export function describeViolation(violation: CompletenessViolation): string {
  const template = messages.invoices[`violation${violation.kind}` as keyof typeof messages.invoices];
  const value = typeof template === 'string' ? template : violation.kind;
  return 'position' in violation ? value.replace('{position}', String(violation.position)) : value;
}

/**
 * Das Formularfeld, das ein Verstoß betrifft — oder `null`.
 *
 * Nur so lässt sich der Hinweis mit dem Feld verbinden: markieren und
 * anspringen. `null` steht für Verstöße, die nicht an einem Feld dieses
 * Formulars hängen — die fehlende Steuernummer etwa liegt in den Firmendaten.
 */
export function fieldOfViolation(violation: CompletenessViolation): string | null {
  switch (violation.kind) {
    case 'NO_BUYER':
      return 'customerId';
    case 'NO_BUYER_ADDRESS':
      return 'buyerAddressLine1';
    case 'FREE_BLOCK_TOO_SHORT':
      return 'buyerFreeText';
    case 'NO_ISSUE_DATE':
      return 'issueDate';
    case 'NO_DUE_DATE':
    case 'DUE_BEFORE_ISSUE':
      return 'dueDate';
    case 'NO_SERVICE_DATE':
      return 'serviceDateFrom';
    case 'SERVICE_PERIOD_REVERSED':
      return 'serviceDateTo';
    case 'LINE_WITHOUT_NAME':
      return `lines[${String(violation.position - 1)}][name]`;
    case 'TAX_RATE_CONTRADICTS_CATEGORY':
      return `lines[${String(violation.position - 1)}][taxRate]`;
    case 'MISSING_VAT_IDS_FOR_REVERSE_CHARGE':
      return 'buyerVatId';
    case 'NO_LINES':
    case 'NO_TAX_IDENTIFIER':
      return null;
  }
}
