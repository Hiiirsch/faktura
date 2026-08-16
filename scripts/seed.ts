/**
 * Realistische Testdaten (NFA-QUAL-06).
 *
 * Erzeugt Kunden, einen Leistungskatalog und Rechnungen über mehrere Jahre in
 * **allen** Statuswerten — Entwurf, offen, teilbezahlt, bezahlt, storniert.
 *
 * **Wozu.** Eine leere Anwendung sieht in jeder Ansicht richtig aus. Erst mit
 * Bestand zeigt sich, ob die Rechnungsliste bei vierzig Zeilen noch lesbar
 * ist, ob das Umsatzdiagramm einen Verlauf zeichnet statt eines einzelnen
 * Balkens und ob die Fristenlisten das Richtige zeigen. Dieselben Daten
 * dienen den Abnahmeszenarien aus §17 des Anforderungskatalogs.
 *
 * **Nur außerhalb der Produktion.** Das Kommando bricht ab, wenn
 * `NODE_ENV=production` gesetzt ist: Testdaten in einer echten Buchhaltung
 * wären nicht nur lästig, sie zögen über den Nummernkreis unumkehrbare
 * Folgen nach sich.
 *
 * Aufruf:
 *
 * ```
 * npm run seed
 * ```
 */
import { EMPTY_COMPANY_PROFILE, saveCompanyProfile } from '@/application/company/company-profile';
import { createCatalogItem } from '@/application/catalog/catalog-service';
import { createCustomer } from '@/application/customers/customer-service';
import { cancelInvoice } from '@/application/invoices/cancel-invoice';
import { issueInvoice } from '@/application/invoices/issue-invoice';
import { createDraftInvoice } from '@/application/invoices/invoice-service';
import { addPayment, markAsFullyPaid } from '@/application/invoices/payments';
import type { DraftBuyer } from '@/domain/invoice/buyer';
import { cents } from '@/domain/money/money';
import { addDays, plainDate, todayIn } from '@/domain/time/plain-date';
import { logger } from '@/infrastructure/logging/logger';
import { disconnectDatabase } from '@/infrastructure/repositories/client';
import {
  DEFAULT_ORGANIZATION_ID,
  organizationContextOf,
} from '@/infrastructure/repositories/organization-context';

const ACTOR = 'seed';
const org = organizationContextOf(DEFAULT_ORGANIZATION_ID);

const COMPANY = {
  ...EMPTY_COMPANY_PROFILE,
  legalName: 'Musterbetrieb Tim Hirsch',
  addressLine1: 'Hauptstraße 12',
  postalCode: '89518',
  city: 'Heidenheim an der Brenz',
  countryCode: 'DE',
  email: 'post@musterbetrieb.example',
  phone: '07321 123456',
  taxNumber: '63/123/45678',
  vatId: 'DE123456789',
  bankAccountHolder: 'Tim Hirsch',
  iban: 'DE89370400440532013000',
  bic: 'COBADEFFXXX',
  bankName: 'Commerzbank',
  defaultPaymentTerms: 14,
};

const CUSTOMERS = [
  { companyName: 'Schulz KG', city: 'Berlin', postalCode: '10115', countryCode: 'DE', vatId: null },
  { companyName: 'Meier GmbH', city: 'Hamburg', postalCode: '20095', countryCode: 'DE', vatId: null },
  { companyName: 'Bauer AG', city: 'München', postalCode: '80331', countryCode: 'DE', vatId: null },
  { companyName: 'Weber & Co', city: 'Köln', postalCode: '50667', countryCode: 'DE', vatId: null },
  // Ein Kunde im EU-Ausland mit USt-IdNr: Er löst Reverse Charge aus
  // (Abnahmeszenario A3).
  {
    companyName: 'Gruber Handels GmbH',
    city: 'Wien',
    postalCode: '1010',
    countryCode: 'AT',
    vatId: 'ATU12345678',
  },
] as const;

const SERVICES = [
  { name: 'Beratung', unitCode: 'HUR', unitPriceCents: 9_500, taxRateBasisPoints: 1_900 },
  { name: 'Workshop', unitCode: 'DAY', unitPriceCents: 78_000, taxRateBasisPoints: 1_900 },
  { name: 'Wartungspauschale', unitCode: 'C62', unitPriceCents: 24_000, taxRateBasisPoints: 1_900 },
  // Ermäßigter Satz — für die getrennte Steueraufstellung (Szenario A2).
  { name: 'Fachbuch', unitCode: 'C62', unitPriceCents: 4_900, taxRateBasisPoints: 700 },
] as const;

/** Ein Pseudo-Zufall mit fester Folge: Derselbe Aufruf ergibt denselben Bestand. */
function makeRandom(seed: number): () => number {
  let state = seed;
  return () => {
    state = (state * 1_103_515_245 + 12_345) % 2_147_483_648;
    return state / 2_147_483_648;
  };
}

const random = makeRandom(20_260_816);

function pick<T>(values: readonly T[]): T {
  const value = values[Math.floor(random() * values.length)];
  if (value === undefined) {
    throw new Error('Leere Auswahl');
  }
  return value;
}

async function main(): Promise<void> {
  if (process.env.NODE_ENV === 'production') {
    throw new Error('Das Seed-Kommando läuft nicht gegen eine Produktionsdatenbank.');
  }

  await saveCompanyProfile(org, COMPANY, ACTOR, null);

  const customers = [];
  for (const entry of CUSTOMERS) {
    customers.push(
      await createCustomer(
        org,
        {
          companyName: entry.companyName,
          contactName: null,
          addressLine1: 'Musterweg 1',
          addressLine2: null,
          postalCode: entry.postalCode,
          city: entry.city,
          countryCode: entry.countryCode,
          email: null,
          phone: null,
          vatId: entry.vatId,
          buyerReference: null,
          paymentTerms: null,
          notes: null,
        },
        ACTOR,
        null,
      ),
    );
  }

  for (const service of SERVICES) {
    await createCatalogItem(
      org,
      {
        name: service.name,
        description: null,
        unitCode: service.unitCode,
        unitPriceCents: cents(service.unitPriceCents),
        taxRateBasisPoints: service.taxRateBasisPoints,
      },
      ACTOR,
      null,
    );
  }

  const today = todayIn('Europe/Berlin', new Date());
  const startYear = Number(today.slice(0, 4)) - 2;

  let issued = 0;
  let drafts = 0;
  let paid = 0;
  let partiallyPaid = 0;
  let cancelled = 0;

  /*
   * Aufsteigend nach Datum: Das Festschreiben weist eine Rückdatierung vor
   * eine bereits vergebene Nummer desselben Bereichs ab (FA-NUM-07).
   */
  for (let year = startYear; year <= Number(today.slice(0, 4)); year += 1) {
    for (let month = 1; month <= 12; month += 1) {
      const issueDate = `${String(year)}-${String(month).padStart(2, '0')}-${String(
        1 + Math.floor(random() * 25),
      ).padStart(2, '0')}`;

      // Nicht über den heutigen Tag hinaus datieren.
      if (issueDate > today) {
        continue;
      }

      const perMonth = 1 + Math.floor(random() * 3);

      for (let index = 0; index < perMonth; index += 1) {
        const customer = pick(customers);
        const buyer: DraftBuyer = {
          mode: 'CUSTOMER',
          customerId: customer.id,
          fields: {
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
          },
          freeText: null,
        };

        const lineCount = 1 + Math.floor(random() * 3);
        const lines = Array.from({ length: lineCount }, (_, position) => {
          const service = pick(SERVICES);
          return {
            position: position + 1,
            name: service.name,
            description: null,
            quantityScaled: (1 + Math.floor(random() * 8)) * 10_000,
            unitCode: service.unitCode,
            unitPriceCents: service.unitPriceCents,
            taxRateBasisPoints: service.taxRateBasisPoints,
            taxCategory: 'S',
            discountBasisPoints: random() < 0.2 ? 500 : 0,
          };
        });

        const draft = await createDraftInvoice(
          org,
          {
            buyer,
            taxScheme: 'STANDARD',
            currency: 'EUR',
            issueDate,
            serviceDateFrom: issueDate,
            serviceDateTo: null,
            dueDate: addDays(plainDate(issueDate), 14),
            introText: null,
            outroText: null,
            purchaseOrderRef: null,
            templateId: null,
            lines,
          },
          ACTOR,
          null,
        );

        // Etwa jeder zehnte Beleg bleibt Entwurf — die Liste soll auch den
        // Zustand zeigen, in dem noch gearbeitet wird.
        if (random() < 0.1) {
          drafts += 1;
          continue;
        }

        const result = await issueInvoice(org, draft.id, ACTOR, null);
        if (!result.ok) {
          continue;
        }
        issued += 1;

        const roll = random();
        if (roll < 0.08) {
          await cancelInvoice(org, draft.id, 'Falsche Position abgerechnet', ACTOR, null);
          cancelled += 1;
        } else if (roll < 0.7) {
          await markAsFullyPaid(org, draft.id, addDays(plainDate(issueDate), 10), 'Überweisung');
          paid += 1;
        } else if (roll < 0.85) {
          await addPayment(org, draft.id, {
            amountCents: cents(5_000),
            paidAt: addDays(plainDate(issueDate), 12),
            method: 'Überweisung',
            note: 'Teilzahlung',
          });
          partiallyPaid += 1;
        }
        // Der Rest bleibt offen — darunter die überfälligen aus den Vorjahren.
      }
    }
  }

  logger.info('seed.completed', {
    customers: customers.length,
    catalogItems: SERVICES.length,
    issued,
    drafts,
    paid,
    partiallyPaid,
    cancelled,
    years: `${String(startYear)}–${today.slice(0, 4)}`,
  });
}

try {
  await main();
} catch (error) {
  logger.error('seed.failed', { error });
  process.exitCode = 1;
} finally {
  await disconnectDatabase();
}
