/**
 * Prüfung eingefrorener Partnerdaten (FA-RECH-13).
 *
 * Der Snapshot liegt als JSON-Text in der Datenbank. Ein beschädigter oder aus
 * einer früheren Fassung stammender Eintrag darf nicht als gültig durchgehen
 * und stillschweigend leere Felder auf die Rechnung bringen.
 */
import { describe, expect, it } from 'vitest';

import {
  type BuyerSnapshot,
  isBuyerSnapshot,
  isSellerSnapshot,
  partyDisplayName,
  type SellerSnapshot,
} from '@/domain/invoice/snapshot';

const seller: SellerSnapshot = {
  name: 'Musterbetrieb Tim',
  contactName: null,
  addressLine1: 'Hauptstr. 1',
  addressLine2: null,
  postalCode: '89518',
  city: 'Heidenheim',
  countryCode: 'DE',
  email: null,
  phone: null,
  vatId: 'DE123456789',
  taxNumber: '12/345/67890',
  registerCourt: null,
  registerNumber: null,
  managingDirector: null,
  bankAccountHolder: null,
  iban: null,
  bic: null,
  bankName: null,
  website: null,
  footerText: null,
  isSmallBusiness: false,
};

const buyer: BuyerSnapshot = {
  name: 'Beispiel GmbH',
  contactName: 'Frau Beispiel',
  addressLine1: 'Weg 1',
  addressLine2: null,
  postalCode: '10115',
  city: 'Berlin',
  countryCode: 'DE',
  email: null,
  phone: null,
  vatId: null,
  customerNumber: 'K-0001',
  buyerReference: null,
  addressBlock: null,
};

describe('Verkäufer-Snapshot', () => {
  it('erkennt einen vollständigen Snapshot', () => {
    expect(isSellerSnapshot(seller)).toBe(true);
    expect(isSellerSnapshot(JSON.parse(JSON.stringify(seller)))).toBe(true);
  });

  it('weist unvollständige und fremde Werte zurück', () => {
    expect(isSellerSnapshot(null)).toBe(false);
    expect(isSellerSnapshot('Musterbetrieb')).toBe(false);
    expect(isSellerSnapshot({})).toBe(false);
    expect(isSellerSnapshot({ ...seller, name: 42 })).toBe(false);
    // `isSmallBusiness` entscheidet über den §19-Hinweis auf dem Beleg.
    expect(isSellerSnapshot({ ...seller, isSmallBusiness: 'ja' })).toBe(false);
    const { city: _city, ...withoutCity } = seller;
    expect(isSellerSnapshot(withoutCity)).toBe(false);
  });
});

describe('Käufer-Snapshot', () => {
  it('erkennt einen vollständigen Snapshot', () => {
    expect(isBuyerSnapshot(buyer)).toBe(true);
  });

  it('weist unvollständige und fremde Werte zurück', () => {
    expect(isBuyerSnapshot(null)).toBe(false);
    expect(isBuyerSnapshot([])).toBe(false);
    expect(isBuyerSnapshot({ ...buyer, customerNumber: undefined })).toBe(false);
    const { postalCode: _postalCode, ...withoutPostalCode } = buyer;
    expect(isBuyerSnapshot(withoutPostalCode)).toBe(false);
  });
});

describe('Anzeigename', () => {
  it('nimmt den Firmennamen', () => {
    expect(partyDisplayName(buyer)).toBe('Beispiel GmbH');
  });

  it('weicht auf den Ansprechpartner aus', () => {
    expect(partyDisplayName({ ...buyer, name: '  ' })).toBe('Frau Beispiel');
  });

  it('liefert eine leere Zeichenkette, wenn beides fehlt', () => {
    expect(partyDisplayName({ ...buyer, name: '', contactName: null })).toBe('');
  });
});
