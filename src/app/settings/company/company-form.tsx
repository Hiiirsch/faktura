'use client';

import { useActionState } from 'react';
import type { ReactNode } from 'react';

import type { CompanyProfileData } from '@/application/company/company-profile';
import { COUNTRY_CODES } from '@/domain/codes/country-code';
import { CURRENCY_CODES } from '@/domain/codes/currency-code';
import { currencyLabels, messages } from '@/i18n/de';
import { CSRF_FIELD_NAME } from '@/infrastructure/security/csrf';
import {
  Alert,
  CheckboxField,
  FormSection,
  PRIMARY_BUTTON_CLASS,
  SelectField,
  TextAreaField,
  TextField,
} from '@/ui/components/form';

import { type CompanyFormState, saveCompanyProfileAction } from './actions';

const INITIAL_STATE: CompanyFormState = { status: 'idle' };

const COUNTRY_OPTIONS = COUNTRY_CODES.map((code) => ({ value: code, label: code }));
const CURRENCY_OPTIONS = CURRENCY_CODES.map((code) => ({
  value: code,
  label: `${code} — ${currencyLabels[code]}`,
}));

/**
 * Formular der Firmendaten.
 *
 * Client-Komponente, damit bei einem Validierungsfehler die Eingaben erhalten
 * bleiben: Der Server gibt die abgesendeten Werte zurück, und der `key` am
 * Formular sorgt dafür, dass die Felder mit ihnen neu aufgebaut werden. Bei
 * einer Weiterleitung wären alle Eingaben eines derart umfangreichen Formulars
 * verloren.
 */
export function CompanyForm({
  profile,
  csrfToken,
}: {
  readonly profile: CompanyProfileData;
  readonly csrfToken: string;
}): ReactNode {
  const [state, formAction] = useActionState(saveCompanyProfileAction, INITIAL_STATE);

  const submitted = state.status === 'error' ? state.values : {};
  const errors = state.status === 'error' ? state.errors : {};

  const text = (field: keyof CompanyProfileData): string =>
    submitted[field] ?? (profile[field] === null ? '' : String(profile[field]));

  return (
    <form
      action={formAction}
      key={state.status === 'error' ? 'with-errors' : 'clean'}
      className="flex flex-col gap-6"
    >
      <input type="hidden" name={CSRF_FIELD_NAME} value={csrfToken} />

      {state.status === 'saved' ? <Alert tone="success">{messages.common.saved}</Alert> : null}
      {errors.form === undefined ? null : <Alert tone="error">{errors.form}</Alert>}

      <FormSection title={messages.company.sectionIdentity} description={messages.company.sectionIdentityHint}>
        <TextField
          name="legalName"
          label={messages.company.legalName}
          required
          defaultValue={text('legalName')}
          error={errors.legalName}
          autoComplete="organization"
        />
        <TextField
          name="addressLine1"
          label={messages.company.addressLine1}
          required
          defaultValue={text('addressLine1')}
          error={errors.addressLine1}
          autoComplete="street-address"
        />
        <TextField
          name="addressLine2"
          label={messages.company.addressLine2}
          hint={messages.common.optional}
          defaultValue={text('addressLine2')}
          error={errors.addressLine2}
        />
        <div className="grid gap-4 sm:grid-cols-[1fr_2fr]">
          <TextField
            name="postalCode"
            label={messages.company.postalCode}
            required
            defaultValue={text('postalCode')}
            error={errors.postalCode}
            autoComplete="postal-code"
          />
          <TextField
            name="city"
            label={messages.company.city}
            required
            defaultValue={text('city')}
            error={errors.city}
            autoComplete="address-level2"
          />
        </div>
        <SelectField
          name="countryCode"
          label={messages.company.countryCode}
          required
          options={COUNTRY_OPTIONS}
          defaultValue={text('countryCode')}
          error={errors.countryCode}
        />
        <div className="grid gap-4 sm:grid-cols-2">
          <TextField
            name="email"
            label={messages.company.email}
            type="email"
            defaultValue={text('email')}
            error={errors.email}
            autoComplete="email"
          />
          <TextField
            name="phone"
            label={messages.company.phone}
            type="tel"
            defaultValue={text('phone')}
            error={errors.phone}
            autoComplete="tel"
          />
        </div>
        <TextField
          name="website"
          label={messages.company.website}
          defaultValue={text('website')}
          error={errors.website}
        />
      </FormSection>

      <FormSection title={messages.company.sectionTax} description={messages.company.sectionTaxHint}>
        <div className="grid gap-4 sm:grid-cols-2">
          <TextField
            name="taxNumber"
            label={messages.company.taxNumber}
            defaultValue={text('taxNumber')}
            error={errors.taxNumber}
          />
          <TextField
            name="vatId"
            label={messages.company.vatId}
            defaultValue={text('vatId')}
            error={errors.vatId}
          />
        </div>
        <CheckboxField
          name="isSmallBusiness"
          label={messages.company.isSmallBusiness}
          hint={messages.company.isSmallBusinessHint}
          defaultChecked={
            state.status === 'error' ? submitted.isSmallBusiness === 'on' : profile.isSmallBusiness
          }
        />
      </FormSection>

      <FormSection title={messages.company.sectionRegister}>
        <div className="grid gap-4 sm:grid-cols-2">
          <TextField
            name="registerCourt"
            label={messages.company.registerCourt}
            hint={messages.common.optional}
            defaultValue={text('registerCourt')}
            error={errors.registerCourt}
          />
          <TextField
            name="registerNumber"
            label={messages.company.registerNumber}
            hint={messages.common.optional}
            defaultValue={text('registerNumber')}
            error={errors.registerNumber}
          />
        </div>
        <TextField
          name="managingDirector"
          label={messages.company.managingDirector}
          hint={messages.common.optional}
          defaultValue={text('managingDirector')}
          error={errors.managingDirector}
        />
      </FormSection>

      <FormSection title={messages.company.sectionBank} description={messages.company.sectionBankHint}>
        <TextField
          name="bankAccountHolder"
          label={messages.company.bankAccountHolder}
          defaultValue={text('bankAccountHolder')}
          error={errors.bankAccountHolder}
        />
        <TextField
          name="iban"
          label={messages.company.iban}
          defaultValue={text('iban')}
          error={errors.iban}
        />
        <div className="grid gap-4 sm:grid-cols-2">
          <TextField
            name="bic"
            label={messages.company.bic}
            defaultValue={text('bic')}
            error={errors.bic}
          />
          <TextField
            name="bankName"
            label={messages.company.bankName}
            defaultValue={text('bankName')}
            error={errors.bankName}
          />
        </div>
      </FormSection>

      <FormSection title={messages.company.sectionDefaults}>
        <div className="grid gap-4 sm:grid-cols-3">
          <TextField
            name="defaultPaymentTerms"
            label={messages.company.defaultPaymentTerms}
            type="number"
            min={0}
            max={365}
            required
            defaultValue={text('defaultPaymentTerms')}
            error={errors.defaultPaymentTerms}
          />
          <TextField
            name="defaultTaxRate"
            label={messages.company.defaultTaxRate}
            type="number"
            min={0}
            max={100}
            required
            defaultValue={text('defaultTaxRate')}
            error={errors.defaultTaxRate}
          />
          <SelectField
            name="defaultCurrency"
            label={messages.company.defaultCurrency}
            required
            options={CURRENCY_OPTIONS}
            defaultValue={text('defaultCurrency')}
            error={errors.defaultCurrency}
          />
        </div>
        <TextAreaField
          name="footerText"
          label={messages.company.footerText}
          hint={messages.company.footerTextHint}
          defaultValue={text('footerText')}
          error={errors.footerText}
        />
      </FormSection>

      <div>
        <button type="submit" className={PRIMARY_BUTTON_CLASS}>
          {messages.common.save}
        </button>
      </div>
    </form>
  );
}
