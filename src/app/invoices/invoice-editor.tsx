'use client';

import {
  closestCenter,
  DndContext,
  type DragEndEvent,
  KeyboardSensor,
  PointerSensor,
  useSensor,
  useSensors,
} from '@dnd-kit/core';
import {
  arrayMove,
  SortableContext,
  sortableKeyboardCoordinates,
  useSortable,
  verticalListSortingStrategy,
} from '@dnd-kit/sortable';
import { CSS } from '@dnd-kit/utilities';
import { useActionState, useEffect, useId, useMemo, useState } from 'react';
import type { ReactNode } from 'react';

import Link from 'next/link';

import type { CatalogItem } from '@/application/catalog/catalog-service';
import { TAX_CATEGORY_CODES, type TaxCategoryCode } from '@/domain/codes/tax-category';
import { UNIT_CODES, type UnitCode } from '@/domain/codes/unit-code';
import type { BuyerMode } from '@/domain/invoice/buyer';
import { calculateInvoiceTotals, PERCENT_BASIS_POINTS } from '@/domain/invoice/totals';
import { cents, parseCents } from '@/domain/money/money';
import { parseQuantity, quantityFromScaled } from '@/domain/quantity/quantity';
import { addDays, parsePlainDate } from '@/domain/time/plain-date';
import { TAX_SCHEMES, type TaxScheme, taxCategoryForScheme } from '@/domain/tax/tax-scheme';
import { messages, taxCategoryLabels, unitLabels } from '@/i18n/de';
import { CSRF_FIELD_NAME } from '@/infrastructure/security/csrf';
import { COMPANY_SETTINGS_PATH } from '@/routes';
import { ConfirmDialog } from '@/ui/components/dialog';
import { DateField } from '@/ui/components/date-field';
import {
  Alert,
  SECTION_CLASS,
  FOCUS_RING,
  FormSection,
  INPUT_CLASS,
  PRIMARY_BUTTON_CLASS,
  SECONDARY_BUTTON_CLASS,
  TextAreaField,
  TextField,
} from '@/ui/components/form';
import { announceInvoiceSaved } from '@/ui/components/document-preview';
import { SaveToast } from '@/ui/components/toast';
import { formatMoney, formatPercent, parseGermanDecimal } from '@/ui/format';

import { type InvoiceFormState, issueInvoiceAction, saveDraftAction } from './actions';
import { BuyerFieldset, type EditorBuyerValues } from './buyer-fieldset';

export type EditableLine = {
  readonly key: string;
  name: string;
  description: string;
  quantity: string;
  unitCode: UnitCode;
  unitPrice: string;
  taxRate: string;
  discount: string;
  taxCategory: TaxCategoryCode;
};

export type CustomerOption = {
  readonly id: string;
  readonly label: string;
  readonly paymentTerms: number;
  readonly hasVatId: boolean;
  readonly countryCode: string;
};

export type EditorInitialValues = {
  readonly invoiceId: string | null;
  readonly buyer: EditorBuyerValues;
  readonly templateId: string;
  readonly taxScheme: TaxScheme;
  readonly currency: string;
  readonly issueDate: string;
  readonly serviceDateFrom: string;
  readonly serviceDateTo: string;
  readonly dueDate: string;
  readonly introText: string;
  readonly outroText: string;
  readonly purchaseOrderRef: string;
  readonly lines: readonly EditableLine[];
};

const INITIAL_STATE: InvoiceFormState = { status: 'idle' };

let keyCounter = 0;
function nextKey(): string {
  keyCounter += 1;
  return `line-${String(keyCounter)}`;
}

export function emptyLine(taxScheme: TaxScheme, defaultTaxRatePercent: string): EditableLine {
  const category = taxCategoryForScheme(taxScheme);
  return {
    key: nextKey(),
    name: '',
    description: '',
    quantity: '1',
    unitCode: 'C62',
    unitPrice: '',
    taxRate: category === 'S' ? defaultTaxRatePercent : '0',
    discount: '0',
    taxCategory: category,
  };
}

/** Rechnet den Formularstand in die Eingabe der Domain-Berechnung um. */
function toDomainLines(lines: readonly EditableLine[]) {
  return lines.map((line) => {
    const quantity = parseQuantity(parseGermanDecimal(line.quantity));
    const price = parseCents(parseGermanDecimal(line.unitPrice));
    const taxRate = Number(parseGermanDecimal(line.taxRate) || '0');
    const discount = Number(parseGermanDecimal(line.discount) || '0');

    return {
      quantity: quantity.ok ? quantity.value : quantityFromScaled(0),
      unitPriceCents: price.ok ? price.value : cents(0),
      taxRateBasisPoints: Number.isFinite(taxRate)
        ? Math.round(taxRate * PERCENT_BASIS_POINTS)
        : 0,
      discountBasisPoints: Number.isFinite(discount)
        ? Math.round(discount * PERCENT_BASIS_POINTS)
        : 0,
      taxCategory: line.taxCategory,
    };
  });
}

function SortableLineRow({
  line,
  index,
  count,
  netCents,
  currency,
  onChange,
  onRemove,
  onDuplicate,
  onMove,
}: {
  readonly line: EditableLine;
  readonly index: number;
  readonly count: number;
  readonly netCents: number;
  readonly currency: string;
  readonly onChange: (key: string, patch: Partial<EditableLine>) => void;
  readonly onRemove: (key: string) => void;
  readonly onDuplicate: (key: string) => void;
  readonly onMove: (key: string, delta: number) => void;
}): ReactNode {
  const { attributes, listeners, setNodeRef, transform, transition, isDragging } = useSortable({
    id: line.key,
  });
  const fieldId = useId();

  const cell = 'rounded-control border border-rule bg-surface px-2 py-1.5 text-ui  ';

  return (
    <li
      ref={setNodeRef}
      style={{ transform: CSS.Transform.toString(transform), transition }}
      className={`flex flex-col gap-2 rounded-control border border-rule p-3  ${
        isDragging ? 'opacity-60' : ''
      }`}
    >
      <div className="flex items-center gap-2">
        <button
          type="button"
          className={`${SECONDARY_BUTTON_CLASS} cursor-grab px-2 py-1`}
          aria-label={messages.invoices.lineDragHandle}
          {...attributes}
          {...listeners}
        >
          ⠿
        </button>
        <span className="text-ui font-medium tabular-nums">
          {messages.invoices.linePosition} {index + 1}
        </span>

        <div className="ml-auto flex flex-wrap gap-1">
          <button
            type="button"
            onClick={() => {
              onMove(line.key, -1);
            }}
            disabled={index === 0}
            className={`${SECONDARY_BUTTON_CLASS} px-2 py-1 disabled:opacity-40`}
          >
            {messages.invoices.lineMoveUp}
          </button>
          <button
            type="button"
            onClick={() => {
              onMove(line.key, 1);
            }}
            disabled={index === count - 1}
            className={`${SECONDARY_BUTTON_CLASS} px-2 py-1 disabled:opacity-40`}
          >
            {messages.invoices.lineMoveDown}
          </button>
          <button
            type="button"
            onClick={() => {
              onDuplicate(line.key);
            }}
            className={`${SECONDARY_BUTTON_CLASS} px-2 py-1`}
          >
            {messages.invoices.lineDuplicate}
          </button>
          <button
            type="button"
            onClick={() => {
              onRemove(line.key);
            }}
            className={`${SECONDARY_BUTTON_CLASS} px-2 py-1`}
          >
            {messages.invoices.lineRemove}
          </button>
        </div>
      </div>

      <div className="grid gap-2 sm:grid-cols-2">
        <label className="flex flex-col gap-1 text-ui">
          <span className="font-medium">{messages.invoices.lineName}</span>
          <input
            id={`${fieldId}-name`}
            name={`lines[${String(index)}][name]`}
            value={line.name}
            onChange={(event) => {
              onChange(line.key, { name: event.target.value });
            }}
            className={cell}
            required
          />
        </label>
        <label className="flex flex-col gap-1 text-ui">
          <span className="font-medium">{messages.invoices.lineDescription}</span>
          <input
            id={`${fieldId}-description`}
            name={`lines[${String(index)}][description]`}
            value={line.description}
            onChange={(event) => {
              onChange(line.key, { description: event.target.value });
            }}
            className={cell}
          />
        </label>
      </div>

      <div className="grid gap-2 sm:grid-cols-6">
        <label className="flex flex-col gap-1 text-ui">
          <span className="font-medium">{messages.invoices.lineQuantity}</span>
          <input
            name={`lines[${String(index)}][quantity]`}
            value={line.quantity}
            inputMode="decimal"
            onChange={(event) => {
              onChange(line.key, { quantity: event.target.value });
            }}
            className={`${cell} text-right tabular-nums`}
            required
          />
        </label>
        <label className="flex flex-col gap-1 text-ui">
          <span className="font-medium">{messages.invoices.lineUnit}</span>
          <select
            name={`lines[${String(index)}][unitCode]`}
            value={line.unitCode}
            onChange={(event) => {
              onChange(line.key, { unitCode: event.target.value as UnitCode });
            }}
            className={cell}
          >
            {UNIT_CODES.map((code) => (
              <option key={code} value={code}>
                {unitLabels[code]}
              </option>
            ))}
          </select>
        </label>
        <label className="flex flex-col gap-1 text-ui">
          <span className="font-medium">{messages.invoices.lineUnitPrice}</span>
          <input
            name={`lines[${String(index)}][unitPrice]`}
            value={line.unitPrice}
            inputMode="decimal"
            onChange={(event) => {
              onChange(line.key, { unitPrice: event.target.value });
            }}
            className={`${cell} text-right tabular-nums`}
            required
          />
        </label>
        <label className="flex flex-col gap-1 text-ui">
          <span className="font-medium">{messages.invoices.lineDiscount}</span>
          <input
            name={`lines[${String(index)}][discount]`}
            value={line.discount}
            inputMode="decimal"
            onChange={(event) => {
              onChange(line.key, { discount: event.target.value });
            }}
            className={`${cell} text-right tabular-nums`}
          />
        </label>
        <label className="flex flex-col gap-1 text-ui">
          <span className="font-medium">{messages.invoices.lineTaxRate}</span>
          <input
            name={`lines[${String(index)}][taxRate]`}
            value={line.taxRate}
            inputMode="decimal"
            onChange={(event) => {
              onChange(line.key, { taxRate: event.target.value });
            }}
            className={`${cell} text-right tabular-nums`}
          />
        </label>
        <label className="flex flex-col gap-1 text-ui">
          <span className="font-medium">{messages.invoices.lineTaxCategory}</span>
          <select
            name={`lines[${String(index)}][taxCategory]`}
            value={line.taxCategory}
            onChange={(event) => {
              onChange(line.key, { taxCategory: event.target.value as TaxCategoryCode });
            }}
            className={cell}
          >
            {TAX_CATEGORY_CODES.map((code) => (
              <option key={code} value={code}>
                {code} — {taxCategoryLabels[code]}
              </option>
            ))}
          </select>
        </label>
      </div>

      <p className="text-right text-ui font-medium tabular-nums">
        {messages.invoices.lineNet}: {formatMoney(cents(netCents), currency as 'EUR')}
      </p>
    </li>
  );
}

export function InvoiceEditor({
  initial,
  customers,
  catalog,
  templates,
  defaultTaxRatePercent,
  sellerIsSmallBusiness,
  defaultPaymentTerms,
  csrfToken,
  canIssue,
}: {
  readonly initial: EditorInitialValues;
  readonly customers: readonly CustomerOption[];
  readonly catalog: readonly CatalogItem[];
  readonly templates: readonly {
    readonly id: string;
    readonly label: string;
    readonly isDefault: boolean;
  }[];
  readonly defaultTaxRatePercent: string;
  /** Ob das Unternehmen nach §19 UStG abrechnet (M12). */
  readonly sellerIsSmallBusiness: boolean;
  /** Zahlungsziel der Firmendaten — gilt, wo kein Kunde eines vorgibt. */
  readonly defaultPaymentTerms: number;
  readonly csrfToken: string;
  /**
   * Ob dieses Konto festschreiben darf (M8, `invoice.issue`).
   *
   * Ein Wahrheitswert und kein Akteur: Die Rechte eines Kontos gehören nicht ins
   * Browser-Bündel. Er entscheidet allein über die Sichtbarkeit des Knopfes —
   * geprüft wird in `issueInvoiceAction`.
   */
  readonly canIssue: boolean;
}): ReactNode {
  const [saveState, saveAction] = useActionState(saveDraftAction, INITIAL_STATE);
  const [issueState, issueAction] = useActionState(issueInvoiceAction, INITIAL_STATE);

  const [buyerMode, setBuyerMode] = useState<BuyerMode>(initial.buyer.mode);
  const [customerId, setCustomerId] = useState(initial.buyer.customerId);
  const [taxScheme, setTaxScheme] = useState<TaxScheme>(initial.taxScheme);
  const [issueDate, setIssueDate] = useState(initial.issueDate);
  const [dueDate, setDueDate] = useState(initial.dueDate);
  const [lines, setLines] = useState<readonly EditableLine[]>(
    initial.lines.length > 0 ? initial.lines : [emptyLine(initial.taxScheme, defaultTaxRatePercent)],
  );
  const [isDirty, setDirty] = useState(false);

  const sensors = useSensors(
    useSensor(PointerSensor),
    // Ohne Tastatursensor wäre das Sortieren nur mit der Maus möglich
    // (NFA-QUAL-09); zusätzlich gibt es die Schaltflächen oben/unten.
    useSensor(KeyboardSensor, { coordinateGetter: sortableKeyboardCoordinates }),
  );

  const totals = useMemo(() => {
    try {
      return calculateInvoiceTotals(toDomainLines(lines));
    } catch {
      // Widersprüchliche Eingaben (Kategorie und Satz) melden die Server-
      // seitige Prüfung; die Vorschau bleibt solange leer.
      return null;
    }
  }, [lines]);

  /*
   * Nach dem Speichern erneuert sich die Vorschau (M12, FA-PDF-02).
   *
   * Der Zeitstempel ist die Abhängigkeit, nicht der Status: Zweimal
   * hintereinander speichern ergibt zweimal `'saved'`, und ein Effekt darauf
   * liefe nur einmal. Es ist derselbe Grund, aus dem der Toast ihn trägt.
   */
  useEffect(() => {
    if (saveState.status === 'saved') {
      announceInvoiceSaved();
    }
  }, [saveState]);

  // Ungespeicherte Änderungen beim Verlassen (NFA-QUAL-11).
  useEffect(() => {
    if (!isDirty) {
      return;
    }
    const handler = (event: BeforeUnloadEvent): void => {
      event.preventDefault();
    };
    window.addEventListener('beforeunload', handler);
    return () => {
      window.removeEventListener('beforeunload', handler);
    };
  }, [isDirty]);

  const touch = (): void => {
    setDirty(true);
  };

  const updateLine = (key: string, patch: Partial<EditableLine>): void => {
    setLines((current) => current.map((line) => (line.key === key ? { ...line, ...patch } : line)));
    touch();
  };

  const moveLine = (key: string, delta: number): void => {
    setLines((current) => {
      const index = current.findIndex((line) => line.key === key);
      const target = index + delta;
      if (index < 0 || target < 0 || target >= current.length) {
        return current;
      }
      return arrayMove([...current], index, target);
    });
    touch();
  };

  const handleDragEnd = (event: DragEndEvent): void => {
    const { active, over } = event;
    if (over === null || active.id === over.id) {
      return;
    }
    setLines((current) => {
      const from = current.findIndex((line) => line.key === active.id);
      const to = current.findIndex((line) => line.key === over.id);
      return from < 0 || to < 0 ? current : arrayMove([...current], from, to);
    });
    touch();
  };

  /** Ein Wechsel des Verfahrens setzt Kategorie und Satz aller Positionen neu. */
  const changeScheme = (next: TaxScheme): void => {
    setTaxScheme(next);
    const category = taxCategoryForScheme(next);
    setLines((current) =>
      current.map((line) => ({
        ...line,
        taxCategory: category,
        taxRate: category === 'S' ? defaultTaxRatePercent : '0',
      })),
    );
    touch();
  };

  /**
   * Fälligkeit aus Rechnungsdatum und Zahlungsziel vorbelegen (FA-RECH-08).
   *
   * Ohne Kunden gibt es kein abweichendes Zahlungsziel — dann gilt das der
   * Firmendaten. Sonst bliebe das Feld bei einem freien Empfänger leer, und
   * das Festschreiben scheiterte an einer Angabe, die niemand angefordert hat.
   */
  const applyDueDate = (nextIssueDate: string, nextCustomerId: string): void => {
    const parsed = parsePlainDate(nextIssueDate);
    if (!parsed.ok) {
      return;
    }
    const customer = customers.find((entry) => entry.id === nextCustomerId);
    setDueDate(addDays(parsed.value, customer?.paymentTerms ?? defaultPaymentTerms));
  };

  const applyCatalogItem = (key: string, itemId: string): void => {
    const item = catalog.find((entry) => entry.id === itemId);
    if (item === undefined) {
      return;
    }
    updateLine(key, {
      name: item.name,
      description: item.description ?? '',
      unitCode: item.unitCode as UnitCode,
      unitPrice: (item.unitPriceCents / 100).toFixed(2).replace('.', ','),
      taxRate: String(item.taxRateBasisPoints / PERCENT_BASIS_POINTS),
    });
  };

  const errors =
    issueState.status === 'error'
      ? issueState.messages
      : saveState.status === 'error'
        ? saveState.messages
        : [];

  return (
    <form className="flex flex-col gap-6" onChange={touch}>
      <input type="hidden" name={CSRF_FIELD_NAME} value={csrfToken} />
      {initial.invoiceId === null ? null : (
        <input type="hidden" name="invoiceId" value={initial.invoiceId} />
      )}

      {errors.length > 0 ? (
        <Alert tone="error">
          <span className="flex flex-col gap-1">
            {errors.map((message) => (
              <span key={message}>{message}</span>
            ))}
          </span>
        </Alert>
      ) : null}
      <SaveToast savedAt={saveState.status === 'saved' ? saveState.savedAt : null} />

      <FormSection title={messages.invoices.viewHeading}>
        <BuyerFieldset
          initial={initial.buyer}
          customers={customers}
          mode={buyerMode}
          customerId={customerId}
          onModeChange={(next) => {
            setBuyerMode(next);
            touch();
          }}
          onCustomerChange={(next) => {
            setCustomerId(next);
            applyDueDate(issueDate, next);
            touch();
          }}
        />

        <input type="hidden" name="currency" value={initial.currency} />

        {/* Abweichende Vorlage je Beleg (FA-TPL-03). */}
        <label className="flex flex-col gap-2">
          <span className="text-ui font-medium">{messages.invoices.template}</span>
          {/*
            Ohne leere Auswahl (M11): Ein Eintrag „Standardvorlage" verwies auf
            eine Vorlage, statt eine zu sein. Jetzt stehen nur echte Vorlagen
            darin, die voreingestellte trägt den Zusatz „Standardvorlage", und
            ein neuer Beleg hat sie von Anfang an gewählt.
          */}
          <select
            name="templateId"
            defaultValue={initial.templateId || (templates.find((t) => t.isDefault)?.id ?? '')}
            className={INPUT_CLASS}
          >
            {templates.map((template) => (
              <option key={template.id} value={template.id}>
                {template.label}
              </option>
            ))}
          </select>
        </label>

        <div className="grid gap-4 sm:grid-cols-3">
          <DateField
            name="issueDate"
            label={messages.invoices.issueDate}
            value={issueDate}
            onChange={(next) => {
              setIssueDate(next);
              applyDueDate(next, customerId);
              touch();
            }}
          />
          <DateField
            name="dueDate"
            label={messages.invoices.dueDate}
            value={dueDate}
            hint={messages.invoices.dueDateHint}
            onChange={(next) => {
              setDueDate(next);
              touch();
            }}
          />
          <TextField
            name="purchaseOrderRef"
            label={messages.invoices.purchaseOrderRef}
            defaultValue={initial.purchaseOrderRef}
          />
        </div>

        <div className="grid gap-4 sm:grid-cols-2">
          <DateField
            name="serviceDateFrom"
            label={messages.invoices.serviceDateFrom}
            defaultValue={initial.serviceDateFrom}
            hint={messages.invoices.serviceDateHint}
          />
          <DateField
            name="serviceDateTo"
            label={messages.invoices.serviceDateTo}
            defaultValue={initial.serviceDateTo}
          />
        </div>

        {/*
          Bei §19 ist die steuerliche Behandlung **festgestellt**, keine Frage.

          Sie kommt aus den Firmendaten, und `determineTaxScheme()` lässt sie
          alles andere schlagen — wer keine Umsatzsteuer ausweist, weist auch
          bei einem ausländischen Kunden keine aus. Sie hier als gleichwertigen
          Eintrag neben „Regelbesteuerung" anzubieten machte den teuersten
          Fehlgriff der Anwendung zu einem Klick: Was ausgewiesen ist, schuldet
          man nach §14c, auch wenn es falsch ist.

          Abweichen bleibt möglich — FA-CALC-08 verlangt das —, kostet aber
          einen bewussten Schritt und trägt den Grund neben sich. Das Auswahlfeld
          steht dabei im Baum, auch zugeklappt: Ein `<details>` verbirgt seinen
          Inhalt, nimmt ihn aber nicht aus dem Formular.
        */}
        <fieldset className="flex flex-col gap-1.5">
          <legend className="text-ui font-medium">{messages.invoices.taxScheme} *</legend>

          {sellerIsSmallBusiness && taxScheme === 'SMALL_BUSINESS' ? (
            <>
              <p className="text-ui text-ink">{messages.taxScheme.SMALL_BUSINESS}</p>
              <p className="text-ui text-ink-muted">
                {messages.invoices.taxSchemeFromCompany}{' '}
                <Link href={COMPANY_SETTINGS_PATH} className="underline underline-offset-4">
                  {messages.invoices.taxSchemeCompanyLink}
                </Link>
              </p>
            </>
          ) : null}

          <details
            className={sellerIsSmallBusiness ? 'mt-1 flex flex-col gap-2' : 'contents'}
            open={!sellerIsSmallBusiness || taxScheme !== 'SMALL_BUSINESS'}
          >
            {sellerIsSmallBusiness ? (
              <summary className={`cursor-pointer text-ui text-accent ${FOCUS_RING}`}>
                {messages.invoices.taxSchemeOverride}
              </summary>
            ) : null}

            {sellerIsSmallBusiness ? (
              <p className="mt-2 text-ui text-ink-muted">{messages.invoices.taxSchemeWarning}</p>
            ) : null}

            <select
              name="taxScheme"
              required
              aria-label={messages.invoices.taxScheme}
              value={taxScheme}
              onChange={(event) => {
                changeScheme(event.target.value as TaxScheme);
              }}
              className={sellerIsSmallBusiness ? `${INPUT_CLASS} mt-2` : INPUT_CLASS}
            >
              {TAX_SCHEMES.map((scheme) => (
                <option key={scheme} value={scheme}>
                  {messages.taxScheme[scheme]}
                </option>
              ))}
            </select>

            {sellerIsSmallBusiness ? null : (
              <span className="text-ui text-ink-muted">{messages.invoices.taxSchemeHint}</span>
            )}
          </details>
        </fieldset>
      </FormSection>

      <section className={SECTION_CLASS}>
        <div className="flex flex-wrap items-center justify-between gap-3">
          <h2 className="text-section font-medium">{messages.invoices.linesHeading}</h2>
          <button
            type="button"
            onClick={() => {
              setLines((current) => [...current, emptyLine(taxScheme, defaultTaxRatePercent)]);
              touch();
            }}
            className={SECONDARY_BUTTON_CLASS}
          >
            {messages.invoices.lineAdd}
          </button>
        </div>

        {catalog.length > 0 ? (
          <label className="flex max-w-form flex-col gap-1 text-ui">
            <span className="font-medium">{messages.invoices.lineFromCatalog}</span>
            <select
              className={INPUT_CLASS}
              defaultValue=""
              onChange={(event) => {
                const last = lines[lines.length - 1];
                if (last !== undefined && event.target.value.length > 0) {
                  applyCatalogItem(last.key, event.target.value);
                }
                event.target.value = '';
              }}
            >
              <option value="">{messages.invoices.lineCatalogPlaceholder}</option>
              {catalog.map((item) => (
                <option key={item.id} value={item.id}>
                  {item.name}
                </option>
              ))}
            </select>
          </label>
        ) : null}

        {lines.length === 0 ? (
          <p className="text-ui text-ink-muted">
            {messages.invoices.linesEmpty}
          </p>
        ) : (
          <DndContext sensors={sensors} collisionDetection={closestCenter} onDragEnd={handleDragEnd}>
            <SortableContext
              items={lines.map((line) => line.key)}
              strategy={verticalListSortingStrategy}
            >
              <ul className="flex flex-col gap-3">
                {lines.map((line, index) => (
                  <SortableLineRow
                    key={line.key}
                    line={line}
                    index={index}
                    count={lines.length}
                    netCents={totals?.lineNets[index] ?? 0}
                    currency={initial.currency}
                    onChange={updateLine}
                    onRemove={(key) => {
                      setLines((current) => current.filter((entry) => entry.key !== key));
                      touch();
                    }}
                    onDuplicate={(key) => {
                      setLines((current) => {
                        const index = current.findIndex((entry) => entry.key === key);
                        const source = current[index];
                        if (source === undefined) {
                          return current;
                        }
                        const copy = { ...source, key: nextKey() };
                        return [...current.slice(0, index + 1), copy, ...current.slice(index + 1)];
                      });
                      touch();
                    }}
                    onMove={moveLine}
                  />
                ))}
              </ul>
            </SortableContext>
          </DndContext>
        )}
      </section>

      <FormSection title={messages.invoices.totalsHeading}>
        <dl className="flex flex-col gap-2 text-ui">
          <div className="flex justify-between gap-4">
            <dt>{messages.invoices.net}</dt>
            <dd className="tabular-nums">
              {formatMoney(cents(totals?.netTotalCents ?? 0), initial.currency as 'EUR')}
            </dd>
          </div>
          {(totals?.taxBreakdown ?? []).map((group) => (
            <div
              key={`${String(group.taxRateBasisPoints)}-${group.taxCategory}`}
              className="flex justify-between gap-4 text-ink-muted"
            >
              <dt>
                {formatPercent(group.taxRateBasisPoints)} ({group.taxCategory}) auf{' '}
                {formatMoney(cents(group.netCents), initial.currency as 'EUR')}
              </dt>
              <dd className="tabular-nums">
                {formatMoney(cents(group.taxCents), initial.currency as 'EUR')}
              </dd>
            </div>
          ))}
          <div className="flex justify-between gap-4">
            <dt>{messages.invoices.tax}</dt>
            <dd className="tabular-nums">
              {formatMoney(cents(totals?.taxTotalCents ?? 0), initial.currency as 'EUR')}
            </dd>
          </div>
          <div className="flex justify-between gap-4 border-t border-rule pt-2 font-medium">
            <dt>{messages.invoices.gross}</dt>
            <dd className="tabular-nums">
              {formatMoney(cents(totals?.grossTotalCents ?? 0), initial.currency as 'EUR')}
            </dd>
          </div>
        </dl>
      </FormSection>

      <FormSection title={messages.invoices.textsHeading}>
        <TextAreaField
          name="introText"
          label={messages.invoices.introText}
          rows={2}
          defaultValue={initial.introText}
        />
        <TextAreaField
          name="outroText"
          label={messages.invoices.outroText}
          rows={2}
          defaultValue={initial.outroText}
        />
      </FormSection>

      <div className="flex flex-wrap gap-3">
        <button
          type="submit"
          formAction={saveAction}
          onClick={() => {
            setDirty(false);
          }}
          className={PRIMARY_BUTTON_CLASS}
        >
          {messages.invoices.saveDraft}
        </button>

        {initial.invoiceId === null || !canIssue ? null : (
          /*
            Festschreiben ist unumkehrbar (NFA-QUAL-12) und wird deshalb
            bestätigt — im Dialog der Anwendung, nicht im Fenster des Browsers
            (FA-UI-17). Diese Stelle war bis M7 die letzte mit
            `window.confirm`: Sie trug die Rückfrage in einem `onClick` statt
            in einem Bauteil und fiel beim Umstellen in M5.8 durch.
          */
          <ConfirmDialog
            title={messages.invoices.issueConfirmTitle}
            message={messages.invoices.issueConfirm}
            confirmLabel={messages.invoices.issue}
            formAction={issueAction}
            trigger={
              <button
                type="submit"
                formAction={issueAction}
                onClick={() => {
                  setDirty(false);
                }}
                className={SECONDARY_BUTTON_CLASS}
              >
                {messages.invoices.issue}
              </button>
            }
          />
        )}

      </div>
    </form>
  );
}
