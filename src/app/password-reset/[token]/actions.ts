'use server';

import { redirect } from 'next/navigation';
import { z } from 'zod';

import { assertRequestIntegrity } from '@/application/auth/assert-request-integrity';
import { readRequestContext } from '@/application/auth/request-context';
import { completePasswordReset } from '@/application/members/redeem';
import { LOGIN_PATH, passwordResetPath } from '@/routes';

/**
 * Ein neues Passwort setzen — **ohne Sitzung**.
 *
 * Derselbe Aufbau wie beim Annehmen einer Einladung, aus demselben Grund: Wer
 * hier ankommt, kommt gerade nicht in sein Konto. `assertRequestIntegrity`
 * bleibt die erste Anweisung; ein fremd ausgelöstes Absenden dieses Formulars
 * änderte ein Passwort.
 *
 * Einfache Server Action statt `useActionState` — das Formular muss ohne
 * JavaScript funktionieren.
 */

const schema = z.object({
  password: z.string().min(1).max(1024),
  passwordRepeat: z.string().min(1).max(1024),
});

export type ResetErrorCode = 'invalid' | 'mismatch' | 'tooShort' | 'compromised' | 'rejected';

function fail(token: string, code: ResetErrorCode): never {
  redirect(`${passwordResetPath(token)}?error=${code}`);
}

export async function completePasswordResetAction(
  token: string,
  formData: FormData,
): Promise<void> {
  try {
    await assertRequestIntegrity(formData);
  } catch {
    fail(token, 'rejected');
  }

  const parsed = schema.safeParse({
    password: formData.get('password'),
    passwordRepeat: formData.get('passwordRepeat'),
  });

  if (!parsed.success) {
    fail(token, 'tooShort');
  }
  if (parsed.data.password !== parsed.data.passwordRepeat) {
    fail(token, 'mismatch');
  }

  const context = await readRequestContext();
  const result = await completePasswordReset(token, parsed.data.password, context.ipAddress);

  if (!result.ok) {
    if (result.error.kind === 'INVALID') {
      fail(token, 'invalid');
    }

    const first = result.error.violations[0];
    fail(token, first?.kind === 'COMPROMISED' ? 'compromised' : 'tooShort');
  }

  redirect(`${LOGIN_PATH}?passwort=1`);
}
