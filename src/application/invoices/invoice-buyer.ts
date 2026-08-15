/**
 * Der Empfänger eines gespeicherten Belegs (M5.7).
 *
 * Eine Rechnung trägt ihren Empfänger in einer von drei Formen — als Verweis
 * auf die Stammdaten, in eigenen Feldern oder als freier Anschriftenblock. Der
 * Rest der Anwendung soll davon nichts wissen müssen: Er bekommt hier eine
 * Partei, gleich woher sie stammt.
 *
 * Die Umwandlung steht an **einer** Stelle, weil sie an zweien gebraucht wird —
 * beim Festschreiben, wo aus ihr der eingefrorene Snapshot entsteht, und beim
 * Setzen eines Entwurfs, wo sie unmittelbar auf den Beleg geht. Zwei
 * Umsetzungen liefen früher oder später auseinander, und die Abweichung fiele
 * erst auf, wenn ein festgeschriebener Beleg anders aussieht als seine
 * Vorschau.
 */
import type { DocumentBuyer } from '@/domain/document/invoice-document';
import {
  type BuyerMode,
  type DraftBuyer,
  freeTextLines,
  isBuyerMode,
} from '@/domain/invoice/buyer';
import type { BuyerSnapshot } from '@/domain/invoice/snapshot';

/** Die Empfängerspalten eines Belegs, wie sie aus der Datenbank kommen. */
export type StoredBuyer = {
  readonly buyerMode: string;
  readonly customerId: string | null;
  readonly buyerName: string | null;
  readonly buyerContactName: string | null;
  readonly buyerAddressLine1: string | null;
  readonly buyerAddressLine2: string | null;
  readonly buyerPostalCode: string | null;
  readonly buyerCity: string | null;
  readonly buyerCountryCode: string | null;
  readonly buyerEmail: string | null;
  readonly buyerPhone: string | null;
  readonly buyerVatId: string | null;
  readonly buyerFreeText: string | null;
};

/** Die Kundenfelder, soweit der Empfänger daraus stammt. */
export type StoredCustomer = {
  readonly companyName: string | null;
  readonly contactName: string | null;
  readonly addressLine1: string;
  readonly addressLine2: string | null;
  readonly postalCode: string;
  readonly city: string;
  readonly countryCode: string;
  readonly email: string | null;
  readonly phone: string | null;
  readonly vatId: string | null;
  readonly customerNumber: string;
  readonly buyerReference: string | null;
};

function modeOf(value: string): BuyerMode {
  return isBuyerMode(value) ? value : 'CUSTOMER';
}

/** Formt die gespeicherten Spalten in den Domänentyp um. */
export function draftBuyerOf(stored: StoredBuyer): DraftBuyer {
  return {
    mode: modeOf(stored.buyerMode),
    customerId: stored.customerId,
    fields: {
      name: stored.buyerName,
      contactName: stored.buyerContactName,
      addressLine1: stored.buyerAddressLine1,
      addressLine2: stored.buyerAddressLine2,
      postalCode: stored.buyerPostalCode,
      city: stored.buyerCity,
      countryCode: stored.buyerCountryCode,
      email: stored.buyerEmail,
      phone: stored.buyerPhone,
      vatId: stored.buyerVatId,
    },
    freeText: stored.buyerFreeText,
  };
}

/** Ein Kunde als Anzeigename: Firma, sonst Ansprechpartner. */
export function customerDisplayName(customer: StoredCustomer): string {
  return customer.companyName ?? customer.contactName ?? '';
}

/**
 * Der Empfänger für das Dokumentmodell.
 *
 * Im freien Modus bleiben die Adressfelder leer und der Block trägt die
 * Anschrift; die Vorlage entscheidet an seinem Vorhandensein, welche der beiden
 * Darstellungen sie setzt. Der Name steht dabei zusätzlich in `name`, damit
 * Listen und Dateinamen ihn nicht aus dem Block herausschneiden müssen.
 */
export function documentBuyerOf(
  stored: StoredBuyer,
  customer: StoredCustomer | null,
): DocumentBuyer {
  const buyer = draftBuyerOf(stored);

  if (buyer.mode === 'CUSTOMER' && customer !== null) {
    return {
      name: customerDisplayName(customer),
      contactName: customer.contactName,
      address: {
        addressLine1: customer.addressLine1,
        addressLine2: customer.addressLine2,
        postalCode: customer.postalCode,
        city: customer.city,
        countryCode: customer.countryCode,
      },
      addressBlock: null,
      email: customer.email,
      phone: customer.phone,
      vatId: customer.vatId,
      customerNumber: customer.customerNumber,
      buyerReference: customer.buyerReference,
    };
  }

  if (buyer.mode === 'FREE') {
    const lines = freeTextLines(buyer.freeText);

    return {
      name: lines[0] ?? '',
      contactName: null,
      address: {
        addressLine1: '',
        addressLine2: null,
        postalCode: '',
        city: '',
        countryCode: stored.buyerCountryCode ?? 'DE',
      },
      addressBlock: lines,
      email: null,
      phone: null,
      vatId: stored.buyerVatId,
      customerNumber: null,
      buyerReference: null,
    };
  }

  return {
    name: buyer.fields.name ?? '',
    contactName: buyer.fields.contactName,
    address: {
      addressLine1: buyer.fields.addressLine1 ?? '',
      addressLine2: buyer.fields.addressLine2,
      postalCode: buyer.fields.postalCode ?? '',
      city: buyer.fields.city ?? '',
      countryCode: buyer.fields.countryCode ?? 'DE',
    },
    addressBlock: null,
    email: buyer.fields.email,
    phone: buyer.fields.phone,
    vatId: buyer.fields.vatId,
    customerNumber: null,
    buyerReference: null,
  };
}

/**
 * Der Empfänger als einzufrierender Snapshot (FA-RECH-13).
 *
 * Aus demselben Weg wie das Dokumentmodell: Was beim Festschreiben eingefroren
 * wird, ist genau das, was zuvor in der Vorschau stand.
 */
export function buyerSnapshotOf(
  stored: StoredBuyer,
  customer: StoredCustomer | null,
): BuyerSnapshot {
  const buyer = documentBuyerOf(stored, customer);

  return {
    name: buyer.name,
    contactName: buyer.contactName,
    addressLine1: buyer.address.addressLine1,
    addressLine2: buyer.address.addressLine2,
    postalCode: buyer.address.postalCode,
    city: buyer.address.city,
    countryCode: buyer.address.countryCode,
    email: buyer.email,
    phone: buyer.phone,
    vatId: buyer.vatId,
    customerNumber: buyer.customerNumber,
    buyerReference: buyer.buyerReference,
    addressBlock: buyer.addressBlock,
  };
}
