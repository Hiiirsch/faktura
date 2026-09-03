'use server';

import { revalidatePath } from 'next/cache';

import { requireAdminSessionOrThrow } from '@/application/admin/require-admin-session';
import { saveLegalNotices } from '@/application/admin/legal-notices';
import { assertRequestIntegrity } from '@/application/auth/assert-request-integrity';
import { readRequestContext } from '@/application/auth/request-context';
import { messages } from '@/i18n/de';
import { ADMIN_LEGAL_PATH, IMPRINT_PATH, PRIVACY_PATH } from '@/routes';

export type LegalFormState =
  | { readonly status: 'idle' }
  | { readonly status: 'saved'; readonly savedAt: number }
  | { readonly status: 'error'; readonly message: string };

function text(formData: FormData, name: string): string {
  const value = formData.get(name);
  return typeof value === 'string' ? value : '';
}

/**
 * Speichert Impressum und Datenschutzzusatz (M13, NFA-COMP-07).
 *
 * `revalidatePath` auch für die **öffentlichen** Seiten: Sie sind
 * `force-dynamic`, aber der Router hält ihre Antwort im Browser eine Weile
 * vor — wer eben etwas hinterlegt hat, soll es sofort sehen.
 */
export async function saveLegalNoticesAction(
  _previous: LegalFormState,
  formData: FormData,
): Promise<LegalFormState> {
  try {
    await assertRequestIntegrity(formData);
  } catch {
    return { status: 'error', message: messages.common.rejected };
  }

  const session = await requireAdminSessionOrThrow();
  const context = await readRequestContext();

  await saveLegalNotices(
    session.platform,
    { imprint: text(formData, 'imprint'), privacyAddendum: text(formData, 'privacyAddendum') },
    context.ipAddress,
  );

  revalidatePath(ADMIN_LEGAL_PATH);
  revalidatePath(IMPRINT_PATH);
  revalidatePath(PRIVACY_PATH);

  return { status: 'saved', savedAt: Date.now() };
}
