/**
 * Der Empfänger eines Belegs (FA-RECH-02, FA-PFL-01).
 *
 * Ein Beleg richtet sich an jemanden — aber nicht jeder Empfänger gehört in die
 * Stammdaten. Wer einmalig an eine Adresse schreibt, will dafür keinen
 * Kundendatensatz anlegen, den er danach nie wieder braucht. Deshalb drei
 * Quellen:
 *
 * - `CUSTOMER` — aus den Stammdaten. Zahlungsziel und steuerliche Behandlung
 *   werden daraus vorbelegt (FA-RECH-02, FA-RECH-08).
 * - `FIELDS` — dieselben Felder, aber am Beleg erfasst. Land und USt-IdNr sind
 *   dabei, weil die Steuerermittlung ohne sie weder Reverse Charge noch
 *   Ausfuhr erkennen könnte (FA-CALC-06, -07).
 * - `FREE` — ein Anschriftenblock, wie eingegeben. Für den Fall, in dem die
 *   Adresse nicht in Felder passt: Behörden mit vier Zeilen Dienststelle,
 *   Auslandsanschriften mit eigener Ordnung. Die Anwendung kann daraus keine
 *   steuerliche Behandlung ableiten; sie wird von Hand gewählt.
 *
 * Was in allen drei Fällen gilt: §14 UStG verlangt Name und Anschrift des
 * Empfängers. Ohne beides lässt sich kein Beleg festschreiben — nur die Quelle
 * unterscheidet sich, nicht die Pflicht.
 */

export const BUYER_MODES = ['CUSTOMER', 'FIELDS', 'FREE'] as const;

export type BuyerMode = (typeof BUYER_MODES)[number];

export function isBuyerMode(value: string): value is BuyerMode {
  return (BUYER_MODES as readonly string[]).includes(value);
}

/** Am Beleg erfasste Empfängerangaben — Modus `FIELDS`. */
export type BuyerFields = {
  readonly name: string | null;
  readonly contactName: string | null;
  readonly addressLine1: string | null;
  readonly addressLine2: string | null;
  readonly postalCode: string | null;
  readonly city: string | null;
  readonly countryCode: string | null;
  readonly email: string | null;
  readonly phone: string | null;
  readonly vatId: string | null;
};

export type DraftBuyer = {
  readonly mode: BuyerMode;
  /** Nur im Modus `CUSTOMER` gesetzt. */
  readonly customerId: string | null;
  readonly fields: BuyerFields;
  /** Nur im Modus `FREE` gesetzt. */
  readonly freeText: string | null;
};

export const EMPTY_BUYER_FIELDS: BuyerFields = {
  name: null,
  contactName: null,
  addressLine1: null,
  addressLine2: null,
  postalCode: null,
  city: null,
  countryCode: null,
  email: null,
  phone: null,
  vatId: null,
};

/**
 * Die Zeilen eines freien Anschriftenblocks.
 *
 * Leere Zeilen fallen weg: Wer beim Tippen eine Leerzeile stehen lässt, meint
 * keinen Absatz im Adressfeld, und im Fenster eines Umschlags wäre sie eine
 * verschenkte Zeile.
 */
export function freeTextLines(freeText: string | null): readonly string[] {
  if (freeText === null) {
    return [];
  }

  return freeText
    .split(/\r?\n/)
    .map((line) => line.trim())
    .filter((line) => line.length > 0);
}

/**
 * Der Name, unter dem der Empfänger in Listen und Dateinamen erscheint.
 *
 * Im freien Modus die erste Zeile des Blocks. Sie zusätzlich zu speichern
 * hieße, zwei Wahrheiten zu pflegen — und die zweite wäre die, die nach einer
 * Korrektur nicht mehr stimmt.
 */
export function buyerDisplayName(buyer: DraftBuyer, customerName: string | null): string | null {
  switch (buyer.mode) {
    case 'CUSTOMER':
      return customerName;
    case 'FIELDS':
      return buyer.fields.name;
    case 'FREE':
      return freeTextLines(buyer.freeText)[0] ?? null;
  }
}

export type BuyerViolation =
  | { readonly kind: 'NO_BUYER' }
  | { readonly kind: 'NO_BUYER_ADDRESS' }
  /**
   * Der freie Anschriftenblock hat nur eine Zeile (M12).
   *
   * Eigener Fall und nicht `NO_BUYER_ADDRESS`: Dort fehlt ein **Feld**, das man
   * sieht. Hier steht etwas im Feld, und die Regel dahinter — Name und
   * Anschrift auf getrennten Zeilen — ist nirgends abzulesen. „Dem Empfänger
   * fehlt die Anschrift" über einem ausgefüllten Kasten ist ein Widerspruch,
   * den der Benutzer nicht auflösen kann.
   */
  | { readonly kind: 'FREE_BLOCK_TOO_SHORT' };

/**
 * Prüft, ob der Empfänger für das Festschreiben ausreicht (FA-PFL-01).
 *
 * Im Modus `CUSTOMER` genügt die Kennung — die Stammdaten erzwingen Anschrift
 * und Ort bereits beim Anlegen. In den anderen beiden Modi wird hier geprüft,
 * was dort niemand geprüft hat.
 */
export function validateBuyer(buyer: DraftBuyer): readonly BuyerViolation[] {
  const filled = (value: string | null): boolean => value !== null && value.trim().length > 0;

  switch (buyer.mode) {
    case 'CUSTOMER':
      return filled(buyer.customerId) ? [] : [{ kind: 'NO_BUYER' }];

    case 'FIELDS': {
      if (!filled(buyer.fields.name)) {
        return [{ kind: 'NO_BUYER' }];
      }
      const hasAddress = filled(buyer.fields.addressLine1) && filled(buyer.fields.city);
      return hasAddress ? [] : [{ kind: 'NO_BUYER_ADDRESS' }];
    }

    case 'FREE': {
      const lines = freeTextLines(buyer.freeText);
      if (lines.length === 0) {
        return [{ kind: 'NO_BUYER' }];
      }
      // Name **und** Anschrift: Eine einzelne Zeile ist ein Name ohne Adresse.
      return lines.length >= 2 ? [] : [{ kind: 'FREE_BLOCK_TOO_SHORT' }];
    }
  }
}
