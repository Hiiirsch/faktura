'use server';

import { revalidatePath } from 'next/cache';
import { redirect } from 'next/navigation';
import { z } from 'zod';

import { assertRequestIntegrity } from '@/application/auth/assert-request-integrity';
import { readRequestContext } from '@/application/auth/request-context';
import { requireSessionOrThrow } from '@/application/auth/require-session';
import { cancelInvoice } from '@/application/invoices/cancel-invoice';
import { issueInvoice } from '@/application/invoices/issue-invoice';
import {
  createDraftInvoice,
  deleteDraftInvoice,
  type DraftInvoiceData,
  duplicateInvoice,
  updateDraftInvoice,
} from '@/application/invoices/invoice-service';
import {
  addPayment,
  markAsFullyPaid,
  removePayment,
} from '@/application/invoices/payments';
import { getAppTimeZone } from '@/application/system/display-settings';
import { isTaxCategoryCode } from '@/domain/codes/tax-category';
import { isBuyerMode } from '@/domain/invoice/buyer';
import { isUnitCode } from '@/domain/codes/unit-code';
import type { CompletenessViolation } from '@/domain/invoice/completeness';
import { parseCents } from '@/domain/money/money';
import { parseQuantity } from '@/domain/quantity/quantity';
import { isTaxScheme } from '@/domain/tax/tax-scheme';
import { parsePlainDate, todayIn } from '@/domain/time/plain-date';
import { messages } from '@/i18n/de';
import { INVOICES_PATH, invoicePath } from '@/routes';
import { parseGermanDecimal } from '@/ui/format';

/**
 * Liest ein Textfeld aus dem Formular.
 *
 * `FormData.get` liefert Text **oder** eine Datei. Ein `String()` darauf ergäbe
 * bei einer Datei „[object Object]" — ein Wert, der stillschweigend in die
 * Datenbank wanderte.
 */
function readText(formData: FormData, key: string): string {
  const value = formData.get(key);
  return typeof value === 'string' ? value : '';
}

export type InvoiceFormState =
  | { readonly status: 'idle' }
  | { readonly status: 'saved'; readonly id: string }
  | { readonly status: 'issued'; readonly invoiceNumber: string }
  | { readonly status: 'error'; readonly messages: readonly string[] };

const optionalText = z
  .string()
  .trim()
  .max(2000)
  .transform((value) => (value.length === 0 ? null : value));

const optionalDate = z
  .string()
  .trim()
  .transform((value) => (value.length === 0 ? null : value))
  .refine((value) => value === null || parsePlainDate(value).ok, { message: 'DATE' });

/** Ein leeres Feld bedeutet „nicht angegeben", nicht „leerer Text". */
const optionalField = z
  .string()
  .trim()
  .max(200)
  .transform((value) => (value.length === 0 ? null : value));

const headerSchema = z.object({
  // Der Empfänger: Modus plus die Felder aller drei Quellen. Welche davon
  // gelten, entscheidet der Modus — geschickt werden sie alle, damit ein
  // Wechsel im Formular die Eingaben der anderen Maske nicht verwirft.
  buyerMode: z.string().trim().refine(isBuyerMode, { message: 'BUYER_MODE' }),
  customerId: z.string().trim().max(64).transform((v) => (v.length === 0 ? null : v)),
  buyerName: optionalField,
  buyerContactName: optionalField,
  buyerAddressLine1: optionalField,
  buyerAddressLine2: optionalField,
  buyerPostalCode: optionalField,
  buyerCity: optionalField,
  buyerCountryCode: optionalField,
  buyerEmail: optionalField,
  buyerPhone: optionalField,
  buyerVatId: optionalField,
  buyerFreeText: z
    .string()
    .trim()
    .max(2000)
    .transform((value) => (value.length === 0 ? null : value)),
  taxScheme: z.string().trim().refine(isTaxScheme, { message: 'SCHEME' }),
  currency: z.string().trim().length(3),
  issueDate: optionalDate,
  serviceDateFrom: optionalDate,
  serviceDateTo: optionalDate,
  dueDate: optionalDate,
  introText: optionalText,
  outroText: optionalText,
  purchaseOrderRef: z.string().trim().max(200).transform((v) => (v.length === 0 ? null : v)),
  /** Leere Auswahl bedeutet Standardvorlage (FA-TPL-03). */
  templateId: z.string().trim().max(64).transform((v) => (v.length === 0 ? null : v)),
});

/**
 * Liest die Positionen aus dem Formular.
 *
 * Der Editor sendet sie als `lines[0][name]`, `lines[0][quantity]` … — so
 * funktioniert das Formular auch dann, wenn im Browser kein JavaScript die
 * Daten vorher zusammenfasst.
 */
function parseLines(formData: FormData): { ok: true; lines: DraftInvoiceData['lines'] } | { ok: false; message: string } {
  const indices = new Set<number>();
  for (const key of formData.keys()) {
    const match = /^lines\[(\d+)]\[/.exec(key);
    if (match?.[1] !== undefined) {
      indices.add(Number(match[1]));
    }
  }

  const lines: DraftInvoiceData['lines'][number][] = [];

  for (const index of [...indices].sort((a, b) => a - b)) {
    const read = (field: string): string => readText(formData, `lines[${String(index)}][${field}]`);

    const name = read('name').trim();
    const quantity = parseQuantity(parseGermanDecimal(read('quantity')));
    const unitPrice = parseCents(parseGermanDecimal(read('unitPrice')));
    const unitCode = read('unitCode').trim();
    const taxCategory = read('taxCategory').trim();

    if (!quantity.ok) {
      return { ok: false, message: `Position ${String(lines.length + 1)}: ${messages.quantity.malformed}` };
    }
    if (!unitPrice.ok) {
      return { ok: false, message: `Position ${String(lines.length + 1)}: ${messages.catalog.unitPriceInvalid}` };
    }
    if (!isUnitCode(unitCode) || !isTaxCategoryCode(taxCategory)) {
      return { ok: false, message: messages.common.validationFailed };
    }

    const taxRatePercent = Number(parseGermanDecimal(read('taxRate')) || '0');
    const discountPercent = Number(parseGermanDecimal(read('discount')) || '0');

    if (!Number.isFinite(taxRatePercent) || !Number.isFinite(discountPercent)) {
      return { ok: false, message: messages.common.validationFailed };
    }

    lines.push({
      position: lines.length + 1,
      name,
      description: read('description').trim() || null,
      quantityScaled: quantity.value,
      unitCode,
      unitPriceCents: unitPrice.value,
      // Prozent aus der Oberfläche, Basispunkte in der Ablage.
      taxRateBasisPoints: Math.round(taxRatePercent * 100),
      taxCategory,
      discountBasisPoints: Math.round(discountPercent * 100),
    });
  }

  return { ok: true, lines };
}

function parseForm(
  formData: FormData,
): { ok: true; data: DraftInvoiceData } | { ok: false; state: InvoiceFormState } {
  const header = headerSchema.safeParse({
    buyerMode: formData.get('buyerMode') ?? 'CUSTOMER',
    customerId: formData.get('customerId') ?? '',
    buyerName: formData.get('buyerName') ?? '',
    buyerContactName: formData.get('buyerContactName') ?? '',
    buyerAddressLine1: formData.get('buyerAddressLine1') ?? '',
    buyerAddressLine2: formData.get('buyerAddressLine2') ?? '',
    buyerPostalCode: formData.get('buyerPostalCode') ?? '',
    buyerCity: formData.get('buyerCity') ?? '',
    buyerCountryCode: formData.get('buyerCountryCode') ?? '',
    buyerEmail: formData.get('buyerEmail') ?? '',
    buyerPhone: formData.get('buyerPhone') ?? '',
    buyerVatId: formData.get('buyerVatId') ?? '',
    buyerFreeText: formData.get('buyerFreeText') ?? '',
    taxScheme: formData.get('taxScheme'),
    currency: formData.get('currency'),
    issueDate: formData.get('issueDate'),
    serviceDateFrom: formData.get('serviceDateFrom'),
    serviceDateTo: formData.get('serviceDateTo'),
    dueDate: formData.get('dueDate'),
    introText: formData.get('introText'),
    outroText: formData.get('outroText'),
    purchaseOrderRef: formData.get('purchaseOrderRef'),
    templateId: formData.get('templateId') ?? '',
  });

  if (!header.success) {
    return { ok: false, state: { status: 'error', messages: [messages.common.validationFailed] } };
  }

  const lines = parseLines(formData);
  if (!lines.ok) {
    return { ok: false, state: { status: 'error', messages: [lines.message] } };
  }

  const {
    buyerMode,
    customerId,
    buyerName,
    buyerContactName,
    buyerAddressLine1,
    buyerAddressLine2,
    buyerPostalCode,
    buyerCity,
    buyerCountryCode,
    buyerEmail,
    buyerPhone,
    buyerVatId,
    buyerFreeText,
    ...rest
  } = header.data;

  return {
    ok: true,
    data: {
      ...rest,
      buyer: {
        mode: buyerMode,
        customerId,
        fields: {
          name: buyerName,
          contactName: buyerContactName,
          addressLine1: buyerAddressLine1,
          addressLine2: buyerAddressLine2,
          postalCode: buyerPostalCode,
          city: buyerCity,
          countryCode: buyerCountryCode,
          email: buyerEmail,
          phone: buyerPhone,
          vatId: buyerVatId,
        },
        freeText: buyerFreeText,
      },
      lines: lines.lines,
    },
  };
}

/** Übersetzt einen Vollständigkeitsverstoß in einen deutschen Satz. */
function describeViolation(violation: CompletenessViolation): string {
  const template = messages.invoices[`violation${violation.kind}` as keyof typeof messages.invoices];
  const text = typeof template === 'string' ? template : messages.common.validationFailed;
  return 'position' in violation ? text.replace('{position}', String(violation.position)) : text;
}

export async function saveDraftAction(
  _previous: InvoiceFormState,
  formData: FormData,
): Promise<InvoiceFormState> {
  try {
    await assertRequestIntegrity(formData);
  } catch {
    return { status: 'error', messages: [messages.common.rejected] };
  }

  const session = await requireSessionOrThrow();
  const parsed = parseForm(formData);
  if (!parsed.ok) {
    return parsed.state;
  }

  const context = await readRequestContext();
  const existingId = readText(formData, 'invoiceId').trim();

  if (existingId.length === 0) {
    const created = await createDraftInvoice(
      session.organization,
      parsed.data,
      session.userId,
      context.ipAddress,
    );
    revalidatePath(INVOICES_PATH);
    redirect(invoicePath(created.id));
  }

  const result = await updateDraftInvoice(
    session.organization,
    existingId,
    parsed.data,
    session.userId,
    context.ipAddress,
  );
  if (!result.ok) {
    return {
      status: 'error',
      messages: [
        result.error.kind === 'NOT_A_DRAFT'
          ? messages.invoices.errorNOT_A_DRAFT
          : messages.invoices.errorNOT_FOUND,
      ],
    };
  }

  revalidatePath(INVOICES_PATH);
  revalidatePath(invoicePath(existingId));
  return { status: 'saved', id: existingId };
}

export async function issueInvoiceAction(
  _previous: InvoiceFormState,
  formData: FormData,
): Promise<InvoiceFormState> {
  try {
    await assertRequestIntegrity(formData);
  } catch {
    return { status: 'error', messages: [messages.common.rejected] };
  }

  const session = await requireSessionOrThrow();
  const context = await readRequestContext();

  // Vor dem Festschreiben wird der aktuelle Formularstand gespeichert — sonst
  // schriebe man einen anderen Stand fest als den sichtbaren.
  const parsed = parseForm(formData);
  const invoiceId = readText(formData, 'invoiceId').trim();

  if (invoiceId.length === 0 || !parsed.ok) {
    return parsed.ok
      ? { status: 'error', messages: [messages.invoices.errorNOT_FOUND] }
      : parsed.state;
  }

  const saved = await updateDraftInvoice(
    session.organization,
    invoiceId,
    parsed.data,
    session.userId,
    context.ipAddress,
  );
  if (!saved.ok) {
    return { status: 'error', messages: [messages.invoices.errorNOT_A_DRAFT] };
  }

  const result = await issueInvoice(
    session.organization,
    invoiceId,
    session.userId,
    context.ipAddress,
  );

  if (!result.ok) {
    switch (result.error.kind) {
      case 'INCOMPLETE':
        return { status: 'error', messages: result.error.violations.map(describeViolation) };
      case 'BACKDATED':
        return {
          status: 'error',
          messages: [
            messages.invoices.errorBACKDATED.replace('{lastIssuedDate}', result.error.lastIssuedDate),
          ],
        };
      case 'NO_COMPANY_PROFILE':
        return { status: 'error', messages: [messages.invoices.errorNO_COMPANY_PROFILE] };
      default:
        return { status: 'error', messages: [messages.invoices.errorNOT_A_DRAFT] };
    }
  }

  revalidatePath(INVOICES_PATH);
  revalidatePath(invoicePath(invoiceId));
  return { status: 'issued', invoiceNumber: result.invoiceNumber };
}

const idSchema = z.string().trim().min(1).max(64);

export async function deleteDraftAction(formData: FormData): Promise<void> {
  await assertRequestIntegrity(formData);
  const session = await requireSessionOrThrow();
  const context = await readRequestContext();

  const id = idSchema.safeParse(formData.get('invoiceId'));
  if (!id.success) {
    return;
  }

  const result = await deleteDraftInvoice(
    session.organization,
    id.data,
    session.userId,
    context.ipAddress,
  );
  revalidatePath(INVOICES_PATH);

  if (result.ok) {
    redirect(INVOICES_PATH);
  }
}

export async function duplicateInvoiceAction(formData: FormData): Promise<void> {
  await assertRequestIntegrity(formData);
  const session = await requireSessionOrThrow();
  const context = await readRequestContext();

  const id = idSchema.safeParse(formData.get('invoiceId'));
  if (!id.success) {
    return;
  }

  const result = await duplicateInvoice(
    session.organization,
    id.data,
    session.userId,
    context.ipAddress,
  );
  revalidatePath(INVOICES_PATH);

  if (result.ok) {
    redirect(invoicePath(result.id));
  }
}

export async function cancelInvoiceAction(formData: FormData): Promise<void> {
  await assertRequestIntegrity(formData);
  const session = await requireSessionOrThrow();
  const context = await readRequestContext();

  const id = idSchema.safeParse(formData.get('invoiceId'));
  if (!id.success) {
    return;
  }

  const reason = readText(formData, 'reason').trim();
  const result = await cancelInvoice(
    session.organization,
    id.data,
    reason.length === 0 ? null : reason,
    session.userId,
    context.ipAddress,
  );

  revalidatePath(INVOICES_PATH);
  revalidatePath(invoicePath(id.data));

  if (result.ok) {
    redirect(invoicePath(result.creditNoteId));
  }
}

const paymentSchema = z.object({
  invoiceId: idSchema,
  amount: z.string().trim().min(1),
  paidAt: z.string().trim().min(1),
  method: z.string().trim().max(100).transform((v) => (v.length === 0 ? null : v)),
  note: z.string().trim().max(500).transform((v) => (v.length === 0 ? null : v)),
});

export async function addPaymentAction(formData: FormData): Promise<void> {
  await assertRequestIntegrity(formData);
  const session = await requireSessionOrThrow();

  const parsed = paymentSchema.safeParse({
    invoiceId: formData.get('invoiceId'),
    amount: formData.get('amount'),
    paidAt: formData.get('paidAt'),
    method: formData.get('method'),
    note: formData.get('note'),
  });

  if (!parsed.success) {
    return;
  }

  const amount = parseCents(parseGermanDecimal(parsed.data.amount));
  const paidAt = parsePlainDate(parsed.data.paidAt);

  if (!amount.ok || !paidAt.ok) {
    return;
  }

  await addPayment(session.organization, parsed.data.invoiceId, {
    amountCents: amount.value,
    paidAt: paidAt.value,
    method: parsed.data.method,
    note: parsed.data.note,
  });

  revalidatePath(invoicePath(parsed.data.invoiceId));
  revalidatePath(INVOICES_PATH);
}

export async function markPaidAction(formData: FormData): Promise<void> {
  await assertRequestIntegrity(formData);
  const session = await requireSessionOrThrow();

  const id = idSchema.safeParse(formData.get('invoiceId'));
  const paidAt = parsePlainDate(readText(formData, 'paidAt'));

  if (!id.success || !paidAt.ok) {
    return;
  }

  await markAsFullyPaid(
    session.organization,
    id.data,
    paidAt.value,
    readText(formData, 'method').trim() || null,
  );

  revalidatePath(invoicePath(id.data));
  revalidatePath(INVOICES_PATH);
}

export async function removePaymentAction(formData: FormData): Promise<void> {
  await assertRequestIntegrity(formData);
  const session = await requireSessionOrThrow();

  const paymentId = idSchema.safeParse(formData.get('paymentId'));
  const invoiceId = idSchema.safeParse(formData.get('invoiceId'));

  if (!paymentId.success || !invoiceId.success) {
    return;
  }

  await removePayment(session.organization, paymentId.data);

  revalidatePath(invoicePath(invoiceId.data));
  revalidatePath(INVOICES_PATH);
}

/**
 * Schnellaktionen aus der Rechnungsliste (FA-UI-19, FA-UI-20).
 *
 * Bezahlt markieren, stornieren, duplizieren und Entwürfe löschen waren bisher
 * nur über die Detailseite erreichbar — drei Klicks und ein Seitenwechsel für
 * eine Handlung, die man reihenweise ausführt.
 *
 * **Warum die Belegkennung gebunden wird statt im Formular zu stehen.** Alle
 * Zeilenaktionen liegen in *einem* Formular — verschachtelte Formulare erlaubt
 * HTML nicht. Der naheliegende Weg wäre, den absendenden Knopf über
 * `name`/`value` sagen zu lassen, welche Zeile gemeint ist. Er funktioniert
 * nicht: React belegt `name` des Knopfes selbst, um die Aktionskennung für den
 * Betrieb ohne JavaScript zu übertragen (`$ACTION_ID_…`), und überschreibt
 * dabei den eigenen Namen. Das Feld kam serverseitig nie an; die Aktion brach
 * still ab. Gebunden wird die Kennung deshalb an die Funktion — Next
 * überträgt sie signiert als eigenes Argument.
 *
 * **Warum sie umleiten statt einen Zustand zurückzugeben.** Alle vier laufen
 * in einem Formular, das ohne JavaScript abgesendet wird; es gibt keinen
 * Rückkanal für eine Meldung. Die Umleitung auf dieselbe Seite mit
 * `?erledigt=<schlüssel>` trägt sie stattdessen in der Adresse — sie überlebt
 * kein Neuladen, was richtig ist (sie gilt einer Handlung, nicht einem
 * Zustand), und ein POST endet ohnehin besser mit einer Umleitung als mit
 * einer Antwort, die sich erneut absenden lässt.
 */
export type ListNotice =
  | 'paid'
  | 'paidMany'
  | 'cancelled'
  | 'duplicated'
  | 'draftsDeleted';

function listPathWith(notice: ListNotice, count?: number): string {
  const params = new URLSearchParams({ erledigt: notice });
  if (count !== undefined) {
    params.set('anzahl', String(count));
  }
  return `${INVOICES_PATH}?${params.toString()}`;
}

/** Die gewählten Belege einer Mehrfachauswahl. */
function selectedIds(formData: FormData): readonly string[] {
  return formData
    .getAll('invoiceIds')
    .filter((value): value is string => typeof value === 'string')
    .map((value) => value.trim())
    .filter((value) => value.length > 0 && value.length <= 64);
}

export async function quickMarkPaidAction(
  invoiceId: string,
  formData: FormData,
): Promise<void> {
  await assertRequestIntegrity(formData);
  const session = await requireSessionOrThrow();

  const id = idSchema.safeParse(invoiceId);
  if (!id.success) {
    return;
  }

  // Bezahlt wurde heute — für ein abweichendes Datum gibt es das Formular auf
  // der Belegseite. Die Schnellaktion ist für den Regelfall da, nicht für den
  // Nachtrag.
  const result = await markAsFullyPaid(
    session.organization,
    id.data,
    todayIn(getAppTimeZone(), new Date()),
    null,
  );

  revalidatePath(INVOICES_PATH);
  revalidatePath(invoicePath(id.data));

  if (result.ok) {
    redirect(listPathWith('paid'));
  }
  redirect(INVOICES_PATH);
}

export async function quickCancelAction(invoiceId: string, formData: FormData): Promise<void> {
  await assertRequestIntegrity(formData);
  const session = await requireSessionOrThrow();
  const context = await readRequestContext();

  const id = idSchema.safeParse(invoiceId);
  if (!id.success) {
    return;
  }

  const result = await cancelInvoice(
    session.organization,
    id.data,
    null,
    session.userId,
    context.ipAddress,
  );

  revalidatePath(INVOICES_PATH);
  revalidatePath(invoicePath(id.data));

  if (result.ok) {
    redirect(listPathWith('cancelled'));
  }
  redirect(INVOICES_PATH);
}

export async function quickDuplicateAction(
  invoiceId: string,
  formData: FormData,
): Promise<void> {
  await assertRequestIntegrity(formData);
  const session = await requireSessionOrThrow();
  const context = await readRequestContext();

  const id = idSchema.safeParse(invoiceId);
  if (!id.success) {
    return;
  }

  const result = await duplicateInvoice(
    session.organization,
    id.data,
    session.userId,
    context.ipAddress,
  );
  revalidatePath(INVOICES_PATH);

  // Anders als die übrigen: Ein Duplikat will bearbeitet werden, also führt
  // der Weg dorthin und nicht zurück in die Liste.
  if (result.ok) {
    redirect(invoicePath(result.id));
  }
  redirect(INVOICES_PATH);
}

/**
 * Sammelaktion: mehrere Belege als vollständig bezahlt markieren.
 *
 * Belege, auf die das nicht zutrifft (Entwürfe, bereits bezahlte, stornierte),
 * werden übergangen statt die ganze Aktion scheitern zu lassen — gezählt wird,
 * was tatsächlich geschehen ist, und genau diese Zahl nennt die Meldung.
 */
export async function bulkMarkPaidAction(formData: FormData): Promise<void> {
  await assertRequestIntegrity(formData);
  const session = await requireSessionOrThrow();

  const ids = selectedIds(formData);
  const paidAt = todayIn(getAppTimeZone(), new Date());
  let changed = 0;

  for (const id of ids) {
    const result = await markAsFullyPaid(session.organization, id, paidAt, null);
    if (result.ok) {
      changed += 1;
      revalidatePath(invoicePath(id));
    }
  }

  revalidatePath(INVOICES_PATH);
  redirect(listPathWith('paidMany', changed));
}

export async function bulkDeleteDraftsAction(formData: FormData): Promise<void> {
  await assertRequestIntegrity(formData);
  const session = await requireSessionOrThrow();
  const context = await readRequestContext();

  const ids = selectedIds(formData);
  let changed = 0;

  for (const id of ids) {
    const result = await deleteDraftInvoice(
      session.organization,
      id,
      session.userId,
      context.ipAddress,
    );
    if (result.ok) {
      changed += 1;
    }
  }

  revalidatePath(INVOICES_PATH);
  redirect(listPathWith('draftsDeleted', changed));
}
