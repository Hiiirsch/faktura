'use server';

import { redirect } from 'next/navigation';
import { z } from 'zod';

import { assertRequestIntegrity } from '@/application/auth/assert-request-integrity';
import { readRequestContext } from '@/application/auth/request-context';
import { requestPasswordReset } from '@/application/members/redeem';
import { PASSWORD_RESET_PATH } from '@/routes';

const schema = z.string().trim().toLowerCase().pipe(z.email()).pipe(z.string().max(200));

/**
 * „Passwort vergessen" (M14, B3, FA-MEMB-08).
 *
 * **Der Ausgang ist immer derselbe** — auch bei einer Adresse, die gar keine
 * ist: Eine Ablehnung wegen ungültigen Formats wäre schon eine Auskunft, wenn
 * sie sich von der Bestätigung unterscheidet. Wer nichts Sinnvolles eingibt,
 * bekommt dieselbe Seite wie alle anderen; passiert ist dann eben nichts.
 *
 * Umgeleitet wird auf dieselbe Seite mit `?gesendet=1`. Das hält den Zustand
 * aus der Adresse (M5.8) und verhindert, dass ein Neuladen die Anforderung
 * wiederholt.
 */
export async function requestPasswordResetAction(formData: FormData): Promise<void> {
  await assertRequestIntegrity(formData);

  const parsed = schema.safeParse(formData.get('email'));
  const context = await readRequestContext();

  if (parsed.success) {
    await requestPasswordReset(parsed.data, context.ipAddress);
  }

  redirect(`${PASSWORD_RESET_PATH}?gesendet=1`);
}
