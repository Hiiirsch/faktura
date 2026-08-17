/**
 * Legt den Ausgangsbestand für die Integrationstests an.
 *
 * Läuft **vor** dem Serverstart und schreibt in dessen Datenbank
 * (`integration-test.db`). Die Fachlogik-Prüfungen arbeiten auf einer zweiten
 * Datei, die vor jedem Test neu entsteht — das würde den laufenden Server
 * stören. Wer über den Server prüft, findet seine Daten deshalb hier.
 *
 * Neben den Konten entsteht ein vollständiger Beleg: Der Browsertest braucht
 * etwas, das sich anzeigen lässt, und kann ihn nicht selbst anlegen — sein
 * Prozess schreibt in die andere Datenbank.
 *
 * Bewusst nicht über `scripts/create-user.ts`: Das Kommando fragt das Passwort
 * verdeckt ab und ist damit nicht automatisierbar. Der Weg über dieselben
 * Infrastrukturfunktionen prüft dieselbe Hashing-Konfiguration.
 */
import { EMPTY_COMPANY_PROFILE, saveCompanyProfile } from '@/application/company/company-profile';
import { createCustomer } from '@/application/customers/customer-service';
import { issueInvoice } from '@/application/invoices/issue-invoice';
import { createDraftInvoice } from '@/application/invoices/invoice-service';
import { hashPassword } from '@/infrastructure/auth/password-hasher';
import { createUser, findUserByEmail } from '@/infrastructure/repositories/auth-repository';
import { disconnectDatabase } from '@/infrastructure/repositories/client';
import { customerBuyer } from '../../support/buyer';
import {
  DEFAULT_ORGANIZATION_ID,
  organizationContextOf,
} from '@/infrastructure/repositories/organization-context';

const EMAIL = 'pruefung@example.org';
/** Eigenes Konto für den Sperrtest — es wird dabei für 15 Minuten gesperrt. */
const LOCKOUT_EMAIL = 'sperre@example.org';
/** Eigenes Konto mit zweitem Faktor für den zweistufigen Anmeldeweg (M6.2). */
const TOTP_EMAIL = 'zweifaktor@example.org';
const TOTP_SECRET = 'JBSWY3DPEHPK3PXPJBSWY3DPEHPK3PXP';
const PASSWORD = 'Zwetschgenkuchen-mit-Streuseln-7';

const passwordHash = await hashPassword(PASSWORD);

/**
 * Die Rolle „Inhaber", die die Migration `roles_and_permissions` je Organisation
 * anlegt (M8).
 *
 * Die Testkonten tragen sie, weil der Bestand einer laufenden Installation sie
 * trägt: Vor der Umstellung durfte jedes Konto alles, und die Migration nimmt
 * niemandem etwas weg. Ein Konto **ohne** Rolle hätte nur die Grundrechte —
 * damit fehlten in der Rechnungsliste die Zeilenaktionen, und die Browsertests
 * prüften eine Oberfläche, die kein echtes Konto so sieht.
 */
const OWNER_ROLE_ID = `role_owner_${DEFAULT_ORGANIZATION_ID}`;

for (const email of [EMAIL, LOCKOUT_EMAIL]) {
  if ((await findUserByEmail(email)) === null) {
    await createUser({
      email,
      passwordHash,
      organizationId: DEFAULT_ORGANIZATION_ID,
      roleId: OWNER_ROLE_ID,
    });
  }
}

if ((await findUserByEmail(TOTP_EMAIL)) === null) {
  await createUser({
    email: TOTP_EMAIL,
    passwordHash,
    organizationId: DEFAULT_ORGANIZATION_ID,
    roleId: OWNER_ROLE_ID,
    totpSecret: TOTP_SECRET,
    totpEnabled: true,
  });
}

// Ein festgeschriebener Beleg für den Browsertest.
const organization = organizationContextOf(DEFAULT_ORGANIZATION_ID);
const ACTOR = 'einrichtung';

await saveCompanyProfile(
  organization,
  {
    ...EMPTY_COMPANY_PROFILE,
    legalName: 'Musterbetrieb Tim',
    addressLine1: 'Hauptstr. 1',
    postalCode: '89518',
    city: 'Heidenheim',
    taxNumber: '12/345/67890',
    bankAccountHolder: 'Tim',
    iban: 'DE89370400440532013000',
    bic: 'COBADEFFXXX',
    bankName: 'Commerzbank',
  },
  ACTOR,
  null,
);

const customer = await createCustomer(
  organization,
  {
    companyName: 'Schulz KG',
    contactName: null,
    addressLine1: 'Weg 1',
    addressLine2: null,
    postalCode: '10115',
    city: 'Berlin',
    countryCode: 'DE',
    email: null,
    phone: null,
    vatId: null,
    buyerReference: null,
    paymentTerms: null,
    notes: null,
  },
  ACTOR,
  null,
);

const draft = await createDraftInvoice(
  organization,
  {
    buyer: customerBuyer(customer.id),
    taxScheme: 'STANDARD',
    currency: 'EUR',
    issueDate: '2026-03-01',
    serviceDateFrom: '2026-02-01',
    serviceDateTo: null,
    dueDate: '2026-03-15',
    introText: null,
    outroText: null,
    purchaseOrderRef: null,
    templateId: null,
    lines: [
      {
        position: 1,
        name: 'Beratung',
        description: null,
        quantityScaled: 15_000,
        unitCode: 'HUR',
        unitPriceCents: 9_500,
        taxRateBasisPoints: 1_900,
        taxCategory: 'S',
        discountBasisPoints: 0,
      },
    ],
  },
  ACTOR,
  null,
);

const issued = await issueInvoice(organization, draft.id, ACTOR, null);
if (!issued.ok) {
  throw new Error('Der Beleg für den Browsertest ließ sich nicht festschreiben.');
}

/*
 * Ein zweiter festgeschriebener Beleg.
 *
 * Die Browsertests teilen sich **einen** Server und damit einen Bestand; sie
 * setzen ihn nicht zwischen den Fällen zurück. Mit nur einem offenen Beleg
 * verbrauchte ihn der erste schreibende Test, und der nächste fände keinen
 * mehr — der Fehlschlag hinge dann an der Reihenfolge, nicht an der Sache.
 */
const second = await createDraftInvoice(
  organization,
  {
    buyer: customerBuyer(customer.id),
    taxScheme: 'STANDARD',
    currency: 'EUR',
    issueDate: '2026-03-02',
    serviceDateFrom: '2026-02-01',
    serviceDateTo: null,
    dueDate: '2026-03-16',
    introText: null,
    outroText: null,
    purchaseOrderRef: null,
    templateId: null,
    lines: [
      {
        position: 1,
        name: 'Workshop',
        description: null,
        quantityScaled: 10_000,
        unitCode: 'HUR',
        unitPriceCents: 12_000,
        taxRateBasisPoints: 1_900,
        taxCategory: 'S',
        discountBasisPoints: 0,
      },
    ],
  },
  ACTOR,
  null,
);

const secondIssued = await issueInvoice(organization, second.id, ACTOR, null);
if (!secondIssued.ok) {
  throw new Error('Der zweite Beleg für den Browsertest ließ sich nicht festschreiben.');
}

await disconnectDatabase();
