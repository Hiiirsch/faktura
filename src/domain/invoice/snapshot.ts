/**
 * Eingefrorene Partnerdaten (FA-RECH-13, FA-RECH-14, Spec §4.1).
 *
 * Beim Festschreiben werden Käufer- und Verkäuferdaten in die Rechnung kopiert.
 * Zieht ein Kunde um oder ändert sich die eigene Anschrift, zeigt eine
 * Altrechnung weiterhin den Stand vom Tag der Ausstellung — alles andere wäre
 * eine nachträgliche Änderung eines festgeschriebenen Belegs.
 *
 * Die Felder decken ab, was EN 16931 für Verkäufer (BG-4) und Käufer (BG-7)
 * verlangt, damit das Dokumentmodell in M5 vollständig daraus entstehen kann.
 */

export type PartySnapshot = {
  readonly name: string;
  readonly contactName: string | null;
  readonly addressLine1: string;
  readonly addressLine2: string | null;
  readonly postalCode: string;
  readonly city: string;
  readonly countryCode: string;
  readonly email: string | null;
  readonly phone: string | null;
  readonly vatId: string | null;
};

export type SellerSnapshot = PartySnapshot & {
  readonly taxNumber: string | null;
  readonly registerCourt: string | null;
  readonly registerNumber: string | null;
  readonly managingDirector: string | null;
  readonly bankAccountHolder: string | null;
  readonly iban: string | null;
  readonly bic: string | null;
  readonly bankName: string | null;
  readonly website: string | null;
  readonly footerText: string | null;
  readonly isSmallBusiness: boolean;
};

export type BuyerSnapshot = PartySnapshot & {
  /**
   * Kundennummer — `null`, wenn der Beleg an einen Empfänger ohne Stammdatensatz
   * ging (M5.7). Ältere Snapshots tragen hier immer eine Zeichenkette; der
   * Typwächter unten lässt beides zu, damit sie gültig bleiben.
   */
  readonly customerNumber: string | null;
  /** BT-10, Leitweg-ID bei öffentlichen Auftraggebern. */
  readonly buyerReference: string | null;
  /**
   * Freier Anschriftenblock, Zeile für Zeile — nur bei Belegen aus dem Modus
   * `FREE`. Wo er steht, tritt er auf dem Beleg an die Stelle der einzelnen
   * Adressfelder.
   */
  readonly addressBlock: readonly string[] | null;
};

/** Der vollständige Snapshot, wie er als JSON in der Rechnung liegt. */
export type InvoiceSnapshots = {
  readonly seller: SellerSnapshot;
  readonly buyer: BuyerSnapshot;
};

/**
 * Prüft, ob ein aus der Datenbank gelesener Snapshot die erwartete Form hat.
 *
 * Der Snapshot liegt als JSON-Text vor; ein beschädigter oder aus einer
 * früheren Fassung stammender Eintrag darf nicht als gültig durchgehen und
 * stillschweigend leere Felder auf die Rechnung bringen.
 */
export function isSellerSnapshot(value: unknown): value is SellerSnapshot {
  if (typeof value !== 'object' || value === null) {
    return false;
  }
  const candidate = value as Record<string, unknown>;
  return (
    typeof candidate.name === 'string' &&
    typeof candidate.addressLine1 === 'string' &&
    typeof candidate.postalCode === 'string' &&
    typeof candidate.city === 'string' &&
    typeof candidate.countryCode === 'string' &&
    typeof candidate.isSmallBusiness === 'boolean'
  );
}

export function isBuyerSnapshot(value: unknown): value is BuyerSnapshot {
  if (typeof value !== 'object' || value === null) {
    return false;
  }
  const candidate = value as Record<string, unknown>;

  // Ein Beleg an einen freien Empfänger trägt die Adresse im Block statt in
  // Feldern; dann dürfen die Einzelfelder leer sein. Verlangt wird in beiden
  // Fällen ein Name — ohne ihn wäre der Beleg an niemanden gerichtet.
  const hasAddressBlock = Array.isArray(candidate.addressBlock);
  const hasAddressFields =
    typeof candidate.addressLine1 === 'string' &&
    typeof candidate.postalCode === 'string' &&
    typeof candidate.city === 'string';

  return (
    typeof candidate.name === 'string' &&
    typeof candidate.countryCode === 'string' &&
    (hasAddressFields || hasAddressBlock) &&
    // Ältere Snapshots führen immer eine Kundennummer, neue dürfen `null`
    // tragen. Fehlt das Feld ganz, stammt der Eintrag aus keiner der beiden
    // Fassungen und gilt als beschädigt.
    (typeof candidate.customerNumber === 'string' || candidate.customerNumber === null)
  );
}

/** Anzeigename einer Partei: Firma, sonst Ansprechpartner. */
export function partyDisplayName(party: PartySnapshot): string {
  return party.name.trim().length > 0 ? party.name : (party.contactName ?? '');
}
