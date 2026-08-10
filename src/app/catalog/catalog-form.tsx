'use client';

import { useActionState } from 'react';
import type { ReactNode } from 'react';

import type { CatalogItem } from '@/application/catalog/catalog-service';
import { UNIT_CODES } from '@/domain/codes/unit-code';
import { messages, unitLabels } from '@/i18n/de';
import { CSRF_FIELD_NAME } from '@/infrastructure/security/csrf';
import {
  Alert,
  FormSection,
  PRIMARY_BUTTON_CLASS,
  SelectField,
  TextAreaField,
  TextField,
} from '@/ui/components/form';
import { formatAmount } from '@/ui/format';
import { cents } from '@/domain/money/money';
import { PERCENT_BASIS_POINTS } from '@/domain/invoice/totals';

import { type CatalogFormState, createCatalogItemAction, updateCatalogItemAction } from './actions';

const INITIAL_STATE: CatalogFormState = { status: 'idle' };

const UNIT_OPTIONS = UNIT_CODES.map((code) => ({ value: code, label: unitLabels[code] }));

export function CatalogForm({
  item,
  csrfToken,
}: {
  readonly item?: CatalogItem | undefined;
  readonly csrfToken: string;
}): ReactNode {
  const isEditing = item !== undefined;
  const [state, formAction] = useActionState(
    isEditing ? updateCatalogItemAction : createCatalogItemAction,
    INITIAL_STATE,
  );

  const submitted = state.status === 'error' ? state.values : {};
  const errors = state.status === 'error' ? state.errors : {};

  const priceDefault =
    submitted.unitPrice ?? (item === undefined ? '' : formatAmount(cents(item.unitPriceCents)));

  return (
    <form
      action={formAction}
      key={state.status === 'error' ? 'with-errors' : 'clean'}
      className="flex flex-col gap-6"
    >
      <input type="hidden" name={CSRF_FIELD_NAME} value={csrfToken} />
      {isEditing ? <input type="hidden" name="id" value={item.id} /> : null}

      {state.status === 'saved' ? <Alert tone="success">{messages.common.saved}</Alert> : null}
      {errors.form === undefined ? null : <Alert tone="error">{errors.form}</Alert>}

      <FormSection
        title={isEditing ? messages.catalog.editHeading : messages.catalog.createHeading}
      >
        <TextField
          name="name"
          label={messages.catalog.name}
          required
          defaultValue={submitted.name ?? item?.name ?? ''}
          error={errors.name}
        />
        <TextAreaField
          name="description"
          label={messages.catalog.description}
          hint={messages.common.optional}
          rows={3}
          defaultValue={submitted.description ?? item?.description ?? ''}
          error={errors.description}
        />
        <div className="grid gap-4 sm:grid-cols-3">
          <TextField
            name="unitPrice"
            label={messages.catalog.unitPrice}
            hint={messages.catalog.unitPriceHint}
            required
            inputMode="decimal"
            defaultValue={priceDefault}
            error={errors.unitPrice}
          />
          <SelectField
            name="unitCode"
            label={messages.catalog.unitCode}
            required
            options={UNIT_OPTIONS}
            defaultValue={submitted.unitCode ?? item?.unitCode ?? 'C62'}
            error={errors.unitCode}
          />
          <TextField
            name="taxRatePercent"
            label={messages.catalog.taxRate}
            type="number"
            min={0}
            max={100}
            required
            defaultValue={
              submitted.taxRatePercent ??
              String((item?.taxRateBasisPoints ?? 1900) / PERCENT_BASIS_POINTS)
            }
            error={errors.taxRatePercent}
          />
        </div>
      </FormSection>

      <div>
        <button type="submit" className={PRIMARY_BUTTON_CLASS}>
          {messages.common.save}
        </button>
      </div>
    </form>
  );
}
