/**
 * Stammdaten gegen eine echte Datenbank
 * (FA-STAMM-01, -02, -04, -06, -08, -09, -10; FA-KUND-01, -02, -05, -06, -07).
 *
 * Diese Prüfungen setzen an der Anwendungsschicht an, nicht an der Oberfläche:
 * Dort liegt das Verhalten, das die Anforderungen beschreiben — Nummernvergabe,
 * Archivierung, Protokollierung, Singleton-Zwang. Die Ablage im Dateisystem
 * wird mitgeprüft, weil ein Upload ohne Datei wertlos wäre.
 */
import { rm } from 'node:fs/promises';
import path from 'node:path';

import { PrismaClient } from '@prisma/client';
import { afterAll, beforeEach, describe, expect, it } from 'vitest';

import { getAsset, readAssetContent, storeImageAsset } from '@/application/assets/asset-service';
import {
  createCatalogItem,
  listCatalogItems,
  setCatalogItemArchived,
} from '@/application/catalog/catalog-service';
import {
  EMPTY_COMPANY_PROFILE,
  getCompanyProfile,
  saveCompanyProfile,
} from '@/application/company/company-profile';
import {
  createCustomer,
  type CustomerData,
  getCustomer,
  listCustomers,
  listSelectableCustomers,
  setCustomerArchived,
  updateCustomer,
} from '@/application/customers/customer-service';
import { cents } from '@/domain/money/money';

import { DATA_DATABASE_URL, resetDatabase, TEST_ACTOR_ID } from './setup/database';
import { testOrganization } from './setup/organization';

const prisma = new PrismaClient({ datasources: { db: { url: DATA_DATABASE_URL } } });

const ACTOR = TEST_ACTOR_ID;
const STORAGE_DIR = path.resolve('./data/integration-storage');

const CUSTOMER: CustomerData = {
  companyName: 'Alpen GmbH',
  contactName: null,
  addressLine1: 'Ringstr. 5',
  addressLine2: null,
  postalCode: '1010',
  city: 'Wien',
  countryCode: 'AT',
  email: 'office@alpen.at',
  phone: null,
  vatId: 'ATU12345678',
  buyerReference: null,
  paymentTerms: null,
  notes: null,
};

/** Zuwachs im Protokoll seit einem Merkpunkt (es ist unveränderlich). */
async function auditEntries(entityType: string) {
  return prisma.auditLog.findMany({ where: { entityType }, orderBy: { createdAt: 'asc' } });
}

beforeEach(async () => {
  /*
   * **Erst trennen, dann tauschen** (M10).
   *
   * `resetDatabase()` ersetzt die Datenbankdatei und trennt dafür den Client der
   * **Anwendung**; den eines Testmoduls kennt es nicht. Bleibt der offen, hängt
   * er an der abgehängten alten Datei: Lesezugriffe liefern veraltete oder gar
   * keine Zeilen, Schreibzugriffe scheitern an Fremdschlüsseln auf Zeilen, die
   * es dort nie gab. Beides ist aufgetreten, und beides sah nach einem Fehler in
   * der Fachlogik aus.
   */
  await prisma.$disconnect();
  await resetDatabase();
  await prisma.$disconnect();
});

afterAll(async () => {
  await prisma.$disconnect();
  await rm(STORAGE_DIR, { recursive: true, force: true });
});

describe('Firmenstammdaten (FA-STAMM-01, -02, -06, -08, -09)', () => {
  it('legt das Profil an und liest es zurück', async () => {
    await saveCompanyProfile(testOrganization, 
      {
        ...EMPTY_COMPANY_PROFILE,
        legalName: 'Musterbetrieb Tim',
        addressLine1: 'Hauptstr. 1',
        postalCode: '89518',
        city: 'Heidenheim',
        taxNumber: '12/345/67890',
        iban: 'DE89370400440532013000',
        registerCourt: 'Amtsgericht Ulm',
        managingDirector: 'Tim',
        defaultPaymentTerms: 30,
        defaultTaxRateBasisPoints: 700,
        defaultCurrency: 'EUR',
      },
      ACTOR,
      null,
    );

    const saved = await getCompanyProfile(testOrganization);
    expect(saved?.legalName).toBe('Musterbetrieb Tim');
    expect(saved?.iban).toBe('DE89370400440532013000');
    expect(saved?.registerCourt).toBe('Amtsgericht Ulm');
    expect(saved?.defaultPaymentTerms).toBe(30);
    expect(saved?.defaultTaxRateBasisPoints).toBe(700);
  });

  it('bleibt ein Singleton — auch nach mehrfachem Speichern', async () => {
    for (const name of ['Erster Name', 'Zweiter Name', 'Dritter Name']) {
      await saveCompanyProfile(testOrganization, { ...EMPTY_COMPANY_PROFILE, legalName: name }, ACTOR, null);
    }

    const all = await prisma.companyProfile.findMany();
    expect(all).toHaveLength(1);
    expect(all[0]?.organizationId).toBe(testOrganization.organizationId);
    expect(all[0]?.legalName).toBe('Dritter Name');
  });

  it('lässt sich auf Datenbankebene nicht durch einen zweiten Datensatz ergänzen', async () => {
    await saveCompanyProfile(testOrganization, { ...EMPTY_COMPANY_PROFILE, legalName: 'Einziger' }, ACTOR, null);

    // Der eindeutige Index auf organizationId greift, selbst wenn jemand am
    // Repository vorbei schreibt.
    await expect(
      prisma.companyProfile.create({
        data: {
          organizationId: testOrganization.organizationId,
          legalName: 'Zweiter',
          addressLine1: 'A',
          postalCode: '1',
          city: 'B',
        },
      }),
    ).rejects.toThrow();
  });

  it('protokolliert das Anlegen und jede Änderung mit den betroffenen Feldern (FA-STAMM-09)', async () => {
    await saveCompanyProfile(testOrganization, { ...EMPTY_COMPANY_PROFILE, legalName: 'Erst' }, ACTOR, '10.0.0.1');
    await saveCompanyProfile(testOrganization, { ...EMPTY_COMPANY_PROFILE, legalName: 'Dann' }, ACTOR, '10.0.0.1');

    const entries = await auditEntries('CompanyProfile');

    expect(entries.map((entry) => entry.action)).toEqual(['CREATED', 'UPDATED']);
    expect(entries[1]?.diffJson).toContain('legalName');
    expect(entries[0]?.actorId).toBe(ACTOR);
    expect(entries[0]?.ipAddress).toBe('10.0.0.1');
  });

  it('schreibt keinen Protokolleintrag, wenn sich nichts geändert hat', async () => {
    const data = { ...EMPTY_COMPANY_PROFILE, legalName: 'Unverändert' };
    await saveCompanyProfile(testOrganization, data, ACTOR, null);
    await saveCompanyProfile(testOrganization, data, ACTOR, null);

    expect(await auditEntries('CompanyProfile')).toHaveLength(1);
  });

  it('legt keine Werte der Bankverbindung ins Protokoll (NFA-BETR-10)', async () => {
    await saveCompanyProfile(testOrganization, 
      { ...EMPTY_COMPANY_PROFILE, legalName: 'Mit Bank', iban: 'DE89370400440532013000' },
      ACTOR,
      null,
    );

    const entries = await auditEntries('CompanyProfile');
    expect(JSON.stringify(entries)).not.toContain('DE89370400440532013000');
  });
});

describe('Kundenverwaltung (FA-KUND-01, -02, -05, -06, -07)', () => {
  it('vergibt fortlaufende Kundennummern (FA-KUND-02)', async () => {
    const first = await createCustomer(testOrganization, CUSTOMER, ACTOR, null);
    const second = await createCustomer(testOrganization, { ...CUSTOMER, companyName: 'Zweiter' }, ACTOR, null);
    const third = await createCustomer(testOrganization, { ...CUSTOMER, companyName: 'Dritter' }, ACTOR, null);

    expect([first.customerNumber, second.customerNumber, third.customerNumber]).toEqual([
      'K-0001',
      'K-0002',
      'K-0003',
    ]);
  });

  it('vergibt auch bei gleichzeitiger Anlage eindeutige Nummern', async () => {
    const created = await Promise.all(
      Array.from({ length: 8 }, (_, index) =>
        createCustomer(testOrganization, { ...CUSTOMER, companyName: `Kunde ${String(index)}` }, ACTOR, null),
      ),
    );

    const numbers = created.map((customer) => customer.customerNumber);
    expect(new Set(numbers).size).toBe(numbers.length);
  });

  it('findet Kunden über Name, Nummer, Ort und E-Mail (FA-KUND-01)', async () => {
    await createCustomer(testOrganization, CUSTOMER, ACTOR, null);
    await createCustomer(testOrganization, 
      { ...CUSTOMER, companyName: 'Nordlicht KG', city: 'Kiel', email: 'kontakt@nordlicht.de' },
      ACTOR,
      null,
    );

    expect(await listCustomers(testOrganization, { search: 'Alpen' })).toHaveLength(1);
    expect(await listCustomers(testOrganization, { search: 'Kiel' })).toHaveLength(1);
    expect(await listCustomers(testOrganization, { search: 'nordlicht.de' })).toHaveLength(1);
    expect(await listCustomers(testOrganization, { search: 'K-0001' })).toHaveLength(1);
    expect(await listCustomers(testOrganization, { search: 'gibtesnicht' })).toHaveLength(0);
    expect(await listCustomers(testOrganization)).toHaveLength(2);
  });

  it('übernimmt Änderungen und protokolliert die geänderten Felder', async () => {
    const customer = await createCustomer(testOrganization, CUSTOMER, ACTOR, null);
    await updateCustomer(testOrganization, customer.id, { ...CUSTOMER, city: 'Graz' }, ACTOR, null);

    expect((await getCustomer(testOrganization, customer.id))?.city).toBe('Graz');

    const entries = await prisma.auditLog.findMany({
      where: { entityType: 'Customer', entityId: customer.id },
      orderBy: { createdAt: 'asc' },
    });
    expect(entries.map((entry) => entry.action)).toEqual(['CREATED', 'UPDATED']);
    expect(entries[1]?.diffJson).toContain('city');
  });

  it('behält das kundenspezifische Zahlungsziel (FA-KUND-05)', async () => {
    const customer = await createCustomer(testOrganization, { ...CUSTOMER, paymentTerms: 45 }, ACTOR, null);
    expect((await getCustomer(testOrganization, customer.id))?.paymentTerms).toBe(45);

    const withoutTerms = await createCustomer(testOrganization, 
      { ...CUSTOMER, companyName: 'Ohne Ziel', paymentTerms: null },
      ACTOR,
      null,
    );
    expect((await getCustomer(testOrganization, withoutTerms.id))?.paymentTerms).toBeNull();
  });

  it('archiviert statt zu löschen und nimmt aus der Auswahl (FA-KUND-06, -07)', async () => {
    const customer = await createCustomer(testOrganization, CUSTOMER, ACTOR, null);

    await setCustomerArchived(testOrganization, customer.id, true, ACTOR, null);

    // Weiterhin vorhanden — nur nicht mehr auswählbar.
    expect(await getCustomer(testOrganization, customer.id)).not.toBeNull();
    expect(await listSelectableCustomers(testOrganization)).toHaveLength(0);
    expect(await listCustomers(testOrganization, { includeArchived: true })).toHaveLength(1);

    await setCustomerArchived(testOrganization, customer.id, false, ACTOR, null);
    expect(await listSelectableCustomers(testOrganization)).toHaveLength(1);

    const entries = await prisma.auditLog.findMany({
      where: { entityType: 'Customer', entityId: customer.id },
      orderBy: { createdAt: 'asc' },
    });
    expect(entries.map((entry) => entry.action)).toEqual(['CREATED', 'ARCHIVED', 'UNARCHIVED']);
  });
});

describe('Leistungskatalog (FA-STAMM-10)', () => {
  it('legt Positionen an und führt sie in der Liste', async () => {
    await createCatalogItem(testOrganization, 
      {
        name: 'Beratung',
        description: 'Konzeption und Abstimmung',
        unitPriceCents: cents(9500),
        unitCode: 'HUR',
        taxRateBasisPoints: 1900,
      },
      ACTOR,
      null,
    );

    const items = await listCatalogItems(testOrganization);
    expect(items).toHaveLength(1);
    expect(items[0]?.unitPriceCents).toBe(9500);
    expect(items[0]?.unitCode).toBe('HUR');
  });

  it('blendet archivierte Positionen aus', async () => {
    const item = await createCatalogItem(testOrganization, 
      { name: 'Alt', description: null, unitPriceCents: cents(100), unitCode: 'C62', taxRateBasisPoints: 1900 },
      ACTOR,
      null,
    );

    await setCatalogItemArchived(testOrganization, item.id, true, ACTOR, null);
    expect(await listCatalogItems(testOrganization)).toHaveLength(0);
    expect(await listCatalogItems(testOrganization, true)).toHaveLength(1);
  });
});

describe('Dateiablage (FA-STAMM-05, NFA-SEC-15, NFA-SEC-16)', () => {
  const png = new Uint8Array([
    0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a, 0x00, 0x00, 0x00, 0x0d,
  ]);

  it('legt eine geprüfte Datei ab und liest sie zurück', async () => {
    const result = await storeImageAsset(testOrganization, png, 'image/png', 'logo.png');
    expect(result.ok).toBe(true);
    if (!result.ok) {
      return;
    }

    const asset = await getAsset(testOrganization, result.value.id);
    expect(asset?.mimeType).toBe('image/png');
    // Erzeugter Name, nicht der gelieferte — der bleibt nur Anzeigename.
    expect(asset?.storagePath).toMatch(/^assets\/[0-9a-f-]+\.png$/);
    expect(asset?.fileName).toBe('logo.png');
    expect(asset?.sha256).toMatch(/^[0-9a-f]{64}$/);

    const content = await readAssetContent(asset as NonNullable<typeof asset>);
    expect(new Uint8Array(content)).toEqual(png);
  });

  it('entschärft einen Dateinamen mit Pfadanteilen', async () => {
    const result = await storeImageAsset(testOrganization, png, 'image/png', '../../etc/passwd.png');
    expect(result.ok).toBe(true);
    if (!result.ok) {
      return;
    }

    const asset = await getAsset(testOrganization, result.value.id);
    expect(asset?.fileName).not.toContain('/');
    expect(asset?.fileName).not.toContain('..');
  });

  it('verweigert das Lesen außerhalb des Speicherverzeichnisses', async () => {
    await expect(
      readAssetContent({
        id: 'x',
        fileName: 'x',
        mimeType: 'image/png',
        byteSize: 1,
        sha256: 'x',
        storagePath: '../../etc/passwd',
      }),
    ).rejects.toThrow();
  });

  it('speichert eine SVG-Datei mit Skript gar nicht erst (A7)', async () => {
    const boeswillig = new TextEncoder().encode('<svg><script>alert(1)</script></svg>');
    const result = await storeImageAsset(testOrganization, boeswillig, 'image/svg+xml', 'boese.svg');

    expect(result.ok).toBe(false);
    if (!result.ok) {
      expect(result.error.kind).toBe('ACTIVE_CONTENT');
    }
    expect(await prisma.asset.count({ where: { fileName: 'boese.svg' } })).toBe(0);
  });
});
