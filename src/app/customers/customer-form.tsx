'use client';

import { useActionState } from 'react';
import type { ReactNode } from 'react';

import type { Customer, CustomerData } from '@/application/customers/customer-service';
import { COUNTRY_CODES, DEFAULT_COUNTRY_CODE } from '@/domain/codes/country-code';
import { messages } from '@/i18n/de';
import { CSRF_FIELD_NAME } from '@/infrastructure/security/csrf';
import {
  Alert,
  FormSection,
  PRIMARY_BUTTON_CLASS,
  SelectField,
  TextAreaField,
  TextField,
} from '@/ui/components/form';
import { SaveToast } from '@/ui/components/toast';

import { createCustomerAction, type CustomerFormState, updateCustomerAction } from './actions';

const INITIAL_STATE: CustomerFormState = { status: 'idle' };
const COUNTRY_OPTIONS = COUNTRY_CODES.map((code) => ({ value: code, label: code }));

export function CustomerForm({
  customer,
  csrfToken,
}: {
  /** Fehlt beim Anlegen. */
  readonly customer?: Customer | undefined;
  readonly csrfToken: string;
}): ReactNode {
  const isEditing = customer !== undefined;
  const [state, formAction] = useActionState(
    isEditing ? updateCustomerAction : createCustomerAction,
    INITIAL_STATE,
  );

  const submitted = state.status === 'error' ? state.values : {};
  const errors = state.status === 'error' ? state.errors : {};

  const text = (field: keyof CustomerData): string => {
    const fromSubmission = submitted[field];
    if (fromSubmission !== undefined) {
      return fromSubmission;
    }
    const stored = customer?.[field];
    return stored === null || stored === undefined ? '' : String(stored);
  };

  return (
    <form
      action={formAction}
      key={state.status === 'error' ? 'with-errors' : 'clean'}
      className="flex flex-col gap-6"
    >
      <input type="hidden" name={CSRF_FIELD_NAME} value={csrfToken} />
      {isEditing ? <input type="hidden" name="id" value={customer.id} /> : null}

      <SaveToast savedAt={state.status === 'saved' ? state.savedAt : null} />
      {errors.form === undefined ? null : <Alert tone="error">{errors.form}</Alert>}

      <FormSection title={messages.customers.heading}>
        <div className="grid gap-4 sm:grid-cols-2">
          <TextField
            name="companyName"
            label={messages.customers.companyName}
            defaultValue={text('companyName')}
            error={errors.companyName}
            autoComplete="organization"
          />
          <TextField
            name="contactName"
            label={messages.customers.contactName}
            defaultValue={text('contactName')}
            error={errors.contactName}
            autoComplete="name"
          />
        </div>
        <TextField
          name="addressLine1"
          label={messages.customers.addressLine1}
          required
          defaultValue={text('addressLine1')}
          error={errors.addressLine1}
          autoComplete="street-address"
        />
        <TextField
          name="addressLine2"
          label={messages.customers.addressLine2}
          hint={messages.common.optional}
          defaultValue={text('addressLine2')}
          error={errors.addressLine2}
        />
        <div className="grid gap-4 sm:grid-cols-[1fr_2fr]">
          <TextField
            name="postalCode"
            label={messages.customers.postalCode}
            required
            defaultValue={text('postalCode')}
            error={errors.postalCode}
            autoComplete="postal-code"
          />
          <TextField
            name="city"
            label={messages.customers.city}
            required
            defaultValue={text('city')}
            error={errors.city}
            autoComplete="address-level2"
          />
        </div>
        <SelectField
          name="countryCode"
          label={messages.customers.countryCode}
          required
          options={COUNTRY_OPTIONS}
          defaultValue={text('countryCode') === '' ? DEFAULT_COUNTRY_CODE : text('countryCode')}
          error={errors.countryCode}
        />
        <div className="grid gap-4 sm:grid-cols-2">
          <TextField
            name="email"
            label={messages.customers.email}
            type="email"
            defaultValue={text('email')}
            error={errors.email}
            autoComplete="email"
          />
          <TextField
            name="phone"
            label={messages.customers.phone}
            type="tel"
            defaultValue={text('phone')}
            error={errors.phone}
            autoComplete="tel"
          />
        </div>
      </FormSection>

      <FormSection title={messages.customers.taxSchemeHeading} description={messages.customers.taxSchemeHint}>
        <TextField
          name="vatId"
          label={messages.customers.vatId}
          hint={messages.customers.vatIdHint}
          defaultValue={text('vatId')}
          error={errors.vatId}
        />
        <TextField
          name="buyerReference"
          label={messages.customers.buyerReference}
          hint={messages.customers.buyerReferenceHint}
          defaultValue={text('buyerReference')}
          error={errors.buyerReference}
        />
        <TextField
          name="paymentTerms"
          label={messages.customers.paymentTerms}
          hint={messages.customers.paymentTermsHint}
          type="number"
          min={0}
          max={365}
          defaultValue={text('paymentTerms')}
          error={errors.paymentTerms}
        />
        <TextAreaField
          name="notes"
          label={messages.customers.notes}
          hint={messages.common.optional}
          defaultValue={text('notes')}
          error={errors.notes}
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
