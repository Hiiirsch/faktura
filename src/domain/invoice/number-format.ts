/**
 * Nummernkreis (FA-NUM-01, -05, Spec §6).
 *
 * Die Vorlage kennt vier Platzhalter: `{YYYY}`, `{YY}`, `{MM}` und `{SEQ:n}`.
 * `n` ist die Mindestbreite des Zählers; er wächst darüber hinaus, statt
 * umzubrechen — die zehntausendste Rechnung heißt `RE-2026-10000`, nicht
 * `RE-2026-0000`.
 *
 * Der Zählerbereich ergibt sich aus der Vorlage: Enthält sie eine
 * Jahreskomponente, beginnt der Zähler zum Jahreswechsel neu (FA-NUM-05).
 * Ein Monatszähler entsteht nur zusammen mit einer Jahreskomponente — sonst
 * ergäbe `RE-{MM}-{SEQ:4}` in jedem Januar erneut `RE-01-0001`.
 *
 * Maßgeblich für Jahr und Monat ist das **Rechnungsdatum**, nicht der Zeitpunkt
 * des Festschreibens.
 */
import { err, ok, type Result } from '../shared/result';
import { monthOf, type PlainDate, yearOf } from '../time/plain-date';

export const DEFAULT_INVOICE_NUMBER_FORMAT = 'RE-{YYYY}-{SEQ:4}';

export const INVOICE_SEQUENCE_PREFIX = 'INVOICE';

const MIN_SEQUENCE_WIDTH = 1;
const MAX_SEQUENCE_WIDTH = 12;

const PLACEHOLDER_PATTERN = /\{([A-Z]+)(?::([^}]*))?\}/g;

export type NumberFormatError =
  | { readonly kind: 'EMPTY' }
  | { readonly kind: 'MISSING_SEQUENCE' }
  | { readonly kind: 'MULTIPLE_SEQUENCES' }
  | { readonly kind: 'UNKNOWN_PLACEHOLDER'; readonly placeholder: string }
  | { readonly kind: 'INVALID_SEQUENCE_WIDTH'; readonly min: number; readonly max: number };

export type ParsedNumberFormat = {
  readonly format: string;
  readonly sequenceWidth: number;
  readonly hasYear: boolean;
  readonly hasMonth: boolean;
};

export function parseNumberFormat(format: string): Result<ParsedNumberFormat, NumberFormatError> {
  const trimmed = format.trim();
  if (trimmed.length === 0) {
    return err({ kind: 'EMPTY' });
  }

  let sequenceCount = 0;
  let sequenceWidth = 0;
  let hasYear = false;
  let hasMonth = false;

  for (const match of trimmed.matchAll(PLACEHOLDER_PATTERN)) {
    const [, name = '', argument] = match;

    switch (name) {
      case 'YYYY':
      case 'YY':
        hasYear = true;
        break;
      case 'MM':
        hasMonth = true;
        break;
      case 'SEQ': {
        sequenceCount += 1;
        if (argument === undefined || !/^\d+$/.test(argument)) {
          return err({
            kind: 'INVALID_SEQUENCE_WIDTH',
            min: MIN_SEQUENCE_WIDTH,
            max: MAX_SEQUENCE_WIDTH,
          });
        }
        const width = Number(argument);
        if (width < MIN_SEQUENCE_WIDTH || width > MAX_SEQUENCE_WIDTH) {
          return err({
            kind: 'INVALID_SEQUENCE_WIDTH',
            min: MIN_SEQUENCE_WIDTH,
            max: MAX_SEQUENCE_WIDTH,
          });
        }
        sequenceWidth = width;
        break;
      }
      default:
        return err({ kind: 'UNKNOWN_PLACEHOLDER', placeholder: name });
    }
  }

  if (sequenceCount === 0) {
    return err({ kind: 'MISSING_SEQUENCE' });
  }
  if (sequenceCount > 1) {
    return err({ kind: 'MULTIPLE_SEQUENCES' });
  }

  return ok({ format: trimmed, sequenceWidth, hasYear, hasMonth });
}

export function isValidNumberFormat(format: string): boolean {
  return parseNumberFormat(format).ok;
}

/**
 * Setzt die Platzhalter ein. Eine ungültige Vorlage ist hier bereits
 * ausgeschlossen — sie wird beim Speichern der Einstellungen geprüft.
 */
export function formatInvoiceNumber(
  format: string,
  issueDate: PlainDate,
  sequenceValue: number,
): string {
  if (!Number.isSafeInteger(sequenceValue) || sequenceValue < 1) {
    throw new RangeError(`Zählerstand muss eine positive Ganzzahl sein: ${String(sequenceValue)}`);
  }

  const year = yearOf(issueDate);
  const month = monthOf(issueDate);

  return format.replace(PLACEHOLDER_PATTERN, (whole, name: string, argument?: string) => {
    switch (name) {
      case 'YYYY':
        return String(year).padStart(4, '0');
      case 'YY':
        return String(year % 100).padStart(2, '0');
      case 'MM':
        return String(month).padStart(2, '0');
      case 'SEQ':
        return String(sequenceValue).padStart(Number(argument ?? '1'), '0');
      default:
        return whole;
    }
  });
}

/**
 * Der Zählerbereich zu einer Vorlage und einem Rechnungsdatum.
 *
 * Eine ungültige Vorlage fällt auf den fortlaufenden Bereich zurück — das ist
 * die Variante, die niemals kollidieren kann.
 */
export function sequenceScopeFor(format: string, issueDate: PlainDate): string {
  const parsed = parseNumberFormat(format);
  if (!parsed.ok || !parsed.value.hasYear) {
    return INVOICE_SEQUENCE_PREFIX;
  }

  const year = String(yearOf(issueDate)).padStart(4, '0');
  if (!parsed.value.hasMonth) {
    return `${INVOICE_SEQUENCE_PREFIX}-${year}`;
  }

  const month = String(monthOf(issueDate)).padStart(2, '0');
  return `${INVOICE_SEQUENCE_PREFIX}-${year}-${month}`;
}
