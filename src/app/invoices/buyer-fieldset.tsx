'use client';

import type { ReactNode } from 'react';

import { BUYER_MODES, type BuyerMode } from '@/domain/invoice/buyer';
import { COUNTRY_CODES, DEFAULT_COUNTRY_CODE } from '@/domain/codes/country-code';
import { messages } from '@/i18n/de';
import { FOCUS_RING, INPUT_CLASS, SelectField, TextAreaField, TextField } from '@/ui/components/form';

import type { CustomerOption } from './invoice-editor';

/** Die Empfängerangaben, wie sie im Formular stehen — alle drei Quellen. */
export type EditorBuyerValues = {
  readonly mode: BuyerMode;
  readonly customerId: string;
  readonly name: string;
  readonly contactName: string;
  readonly addressLine1: string;
  readonly addressLine2: string;
  readonly postalCode: string;
  readonly city: string;
  readonly countryCode: string;
  readonly email: string;
  readonly phone: string;
  readonly vatId: string;
  readonly freeText: string;
};

const COUNTRY_OPTIONS = COUNTRY_CODES.map((code) => ({ value: code, label: code }));

const MODE_LABELS: Readonly<Record<BuyerMode, string>> = {
  CUSTOMER: messages.invoices.buyerModeCUSTOMER,
  FIELDS: messages.invoices.buyerModeFIELDS,
  FREE: messages.invoices.buyerModeFREE,
};

/**
 * Der Empfänger des Belegs in drei Quellen (FA-RECH-02, FA-PFL-01).
 *
 * Die Felder der jeweils nicht gewählten Quelle werden **versteckt, nicht
 * entfernt**: Wer zwischen den Masken wechselt, um zu vergleichen, soll seine
 * Eingaben wiederfinden. Versteckte Felder werden mitgeschickt; welche davon
 * gelten, entscheidet allein `buyerMode` auf der Serverseite.
 *
 * Kein Feld trägt `required`. Ein Entwurf darf unvollständig bleiben; geprüft
 * wird beim Festschreiben, und zwar in der Domäne — ein `required` an einem
 * versteckten Feld verhinderte dort nur das Absenden, ohne dass sichtbar wäre,
 * woran es liegt.
 */
export function BuyerFieldset({
  initial,
  customers,
  mode,
  customerId,
  onModeChange,
  onCustomerChange,
  flagged,
}: {
  readonly initial: EditorBuyerValues;
  readonly customers: readonly CustomerOption[];
  readonly mode: BuyerMode;
  readonly customerId: string;
  readonly onModeChange: (mode: BuyerMode) => void;
  readonly onCustomerChange: (customerId: string) => void;
  /** Felder, denen zum Festschreiben etwas fehlt (M12). */
  readonly flagged: ReadonlySet<string>;
}): ReactNode {
  return (
    <fieldset className="flex flex-col gap-4">
      <legend className="text-ui font-medium text-ink">{messages.invoices.buyerLegend}</legend>

      <div className="flex flex-wrap gap-x-6 gap-y-2">
        {BUYER_MODES.map((value) => (
          <label key={value} className="flex items-center gap-2 text-ui text-ink">
            <input
              type="radio"
              name="buyerMode"
              value={value}
              checked={mode === value}
              onChange={() => {
                onModeChange(value);
              }}
              className={`accent-accent ${FOCUS_RING}`}
            />
            {MODE_LABELS[value]}
          </label>
        ))}
      </div>
      <p className="text-small text-ink-muted">{messages.invoices.buyerModeHint}</p>

      <div hidden={mode !== 'CUSTOMER'} className="flex flex-col gap-1.5">
        <label className="text-ui font-medium" htmlFor="customerId">
          {messages.invoices.customer}
        </label>
        <select
          id="customerId"
          name="customerId"
          aria-invalid={flagged.has('customerId') ? true : undefined}
          value={customerId}
          onChange={(event) => {
            onCustomerChange(event.target.value);
          }}
          className={INPUT_CLASS}
        >
          <option value="">{messages.invoices.buyerNoSelection}</option>
          {customers.map((customer) => (
            <option key={customer.id} value={customer.id}>
              {customer.label}
            </option>
          ))}
        </select>
        {customers.length === 0 ? (
          <p className="text-small text-ink-muted">{messages.invoices.buyerNoCustomers}</p>
        ) : null}
      </div>

      <div hidden={mode !== 'FIELDS'} className="flex flex-col gap-4">
        <div className="grid gap-4 sm:grid-cols-2">
          <TextField
            name="buyerName"
            label={messages.invoices.buyerName}
            defaultValue={initial.name}
            autoComplete="organization"
          />
          <TextField
            name="buyerContactName"
            label={messages.invoices.buyerContactName}
            defaultValue={initial.contactName}
            autoComplete="name"
          />
        </div>
        <TextField
          name="buyerAddressLine1"
          invalid={flagged.has('buyerAddressLine1')}
          label={messages.invoices.buyerAddressLine1}
          defaultValue={initial.addressLine1}
          autoComplete="street-address"
        />
        <TextField
          name="buyerAddressLine2"
          label={messages.invoices.buyerAddressLine2}
          hint={messages.common.optional}
          defaultValue={initial.addressLine2}
        />
        <div className="grid gap-4 sm:grid-cols-[1fr_2fr]">
          <TextField
            name="buyerPostalCode"
            label={messages.invoices.buyerPostalCode}
            defaultValue={initial.postalCode}
            autoComplete="postal-code"
          />
          <TextField
            name="buyerCity"
            label={messages.invoices.buyerCity}
            defaultValue={initial.city}
            autoComplete="address-level2"
          />
        </div>
        <div className="grid gap-4 sm:grid-cols-2">
          <SelectField
            name="buyerCountryCode"
            label={messages.invoices.buyerCountryCode}
            options={COUNTRY_OPTIONS}
            defaultValue={initial.countryCode === '' ? DEFAULT_COUNTRY_CODE : initial.countryCode}
          />
          <TextField
            name="buyerVatId"
            label={messages.invoices.buyerVatId}
            hint={messages.common.optional}
            defaultValue={initial.vatId}
          />
        </div>
        <div className="grid gap-4 sm:grid-cols-2">
          <TextField
            name="buyerEmail"
            label={messages.invoices.buyerEmail}
            type="email"
            hint={messages.common.optional}
            defaultValue={initial.email}
            autoComplete="email"
          />
          <TextField
            name="buyerPhone"
            label={messages.invoices.buyerPhone}
            hint={messages.common.optional}
            defaultValue={initial.phone}
            autoComplete="tel"
          />
        </div>
      </div>

      <div hidden={mode !== 'FREE'} className="flex flex-col gap-4">
        <TextAreaField
          name="buyerFreeText"
          invalid={flagged.has('buyerFreeText')}
          label={messages.invoices.buyerFreeText}
          hint={messages.invoices.buyerFreeTextHint}
          rows={6}
          defaultValue={initial.freeText}
        />
      </div>
    </fieldset>
  );
}
