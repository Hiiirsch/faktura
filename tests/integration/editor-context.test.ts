/**
 * Was der Rechnungseditor vorgelegt bekommt (M12 — FA-STAMM-03, FA-CALC-05,
 * FA-CALC-08).
 *
 * **Der Anlass war eine Frage des Auftraggebers**, nicht ein roter Test: „Warum
 * steht die steuerliche Behandlung an der Rechnung? Ich stelle das doch in den
 * Firmendaten ein." Die Antwort war richtig — der Wert wird vorgeschlagen, nicht
 * erfragt — und beim Nachsehen fiel auf, dass der Vorschlag einen Weg hatte, auf
 * dem er die Firmendaten übergeht: **ohne angelegten Kunden** stand dort
 * `'STANDARD'`, gesetzt an `determineTaxScheme()` vorbei.
 *
 * Für einen Kleinunternehmer ist das kein Schönheitsfehler: Sein erster Beleg
 * kam mit 19 % vorbelegt. Was ausgewiesen ist, schuldet man nach §14c.
 */
import { describe, expect, it, beforeEach } from 'vitest';

import { EMPTY_COMPANY_PROFILE, saveCompanyProfile } from '@/application/company/company-profile';
import { createCustomer } from '@/application/customers/customer-service';
import { loadEditorContext } from '@/app/invoices/editor-data';

import { resetDatabase, TEST_ACTOR_ID } from './setup/database';
import { testOrganization as org } from './setup/organization';

const ACTOR = TEST_ACTOR_ID;

const KLEINUNTERNEHMER = {
  ...EMPTY_COMPANY_PROFILE,
  legalName: 'Fotografie Tim',
  addressLine1: 'Hauptstr. 1',
  postalCode: '89518',
  city: 'Heidenheim',
  countryCode: 'DE',
  isSmallBusiness: true,
};

const REGELBESTEUERT = { ...KLEINUNTERNEHMER, isSmallBusiness: false };

async function kunde(countryCode: string, vatId: string | null): Promise<void> {
  await createCustomer(
    org,
    {
      companyName: 'Beispielkunde',
      contactName: null,
      addressLine1: 'Marktplatz 3',
      addressLine2: null,
      postalCode: '89522',
      city: 'Heidenheim',
      countryCode,
      email: null,
      phone: null,
      vatId,
      buyerReference: null,
      paymentTerms: 14,
      notes: null,
    },
    ACTOR,
    null,
  );
}

beforeEach(async () => {
  await resetDatabase();
});

describe('FA-CALC-05 §19 schlägt alles andere — auch den leeren Kundenstamm', () => {
  it('schlägt ohne angelegten Kunden die Kleinunternehmerregelung vor', async () => {
    await saveCompanyProfile(org, KLEINUNTERNEHMER, ACTOR, null);

    const context = await loadEditorContext(org);

    expect(context.customers).toHaveLength(0);
    expect(context.suggestedTaxScheme).toBe('SMALL_BUSINESS');
    expect(context.sellerIsSmallBusiness).toBe(true);
  });

  it('bleibt dabei, wenn der erste Kunde im EU-Ausland sitzt', async () => {
    // Ohne §19 wäre das Reverse Charge. Mit §19 wird keine Steuer ausgewiesen.
    await saveCompanyProfile(org, KLEINUNTERNEHMER, ACTOR, null);
    await kunde('AT', 'ATU12345678');

    expect((await loadEditorContext(org)).suggestedTaxScheme).toBe('SMALL_BUSINESS');
  });

  it('bleibt dabei, wenn der erste Kunde im Drittland sitzt', async () => {
    await saveCompanyProfile(org, KLEINUNTERNEHMER, ACTOR, null);
    await kunde('CH', null);

    expect((await loadEditorContext(org)).suggestedTaxScheme).toBe('SMALL_BUSINESS');
  });
});

describe('FA-STAMM-03 Ohne §19 gilt die gewohnte Ableitung', () => {
  it('schlägt ohne Kunden die Regelbesteuerung vor', async () => {
    await saveCompanyProfile(org, REGELBESTEUERT, ACTOR, null);

    const context = await loadEditorContext(org);

    expect(context.suggestedTaxScheme).toBe('STANDARD');
    expect(context.sellerIsSmallBusiness).toBe(false);
  });

  it('schlägt bei einem EU-Kunden mit USt-IdNr Reverse Charge vor', async () => {
    await saveCompanyProfile(org, REGELBESTEUERT, ACTOR, null);
    await kunde('AT', 'ATU12345678');

    expect((await loadEditorContext(org)).suggestedTaxScheme).toBe('REVERSE_CHARGE');
  });

  it('schlägt bei einem Kunden im Drittland die Ausfuhr vor', async () => {
    await saveCompanyProfile(org, REGELBESTEUERT, ACTOR, null);
    await kunde('CH', null);

    expect((await loadEditorContext(org)).suggestedTaxScheme).toBe('EXPORT');
  });
});
