'use server';

import { redirect } from 'next/navigation';
import { z } from 'zod';

import { assertRequestIntegrity } from '@/application/auth/assert-request-integrity';
import { readRequestContext } from '@/application/auth/request-context';
import { acceptInvitation } from '@/application/members/redeem';
import { invitationPath, LOGIN_PATH } from '@/routes';

/**
 * Eine Einladung annehmen — **ohne Sitzung**.
 *
 * Kein `requireSession` und kein `authorize`: Wer hier ankommt, hat noch kein
 * Konto. Der Nachweis ist der Token; geprüft wird er in `acceptInvitation`.
 * `assertRequestIntegrity` bleibt trotzdem die erste Anweisung — ein fremd
 * ausgelöstes Absenden dieses Formulars legte ein Konto an.
 *
 * Eine Server-Komponente mit einfacher Server Action statt `useActionState`:
 * Wie die Anmeldung muss dieses Formular **ohne JavaScript** funktionieren.
 * Wer eingeladen wird, öffnet den Link vielleicht in einem Browser, den er
 * nicht kennt, und ein Konto einzurichten ist keine Stelle für einen
 * Rückschlag. Fehler reisen deshalb in der Adresse.
 */

const schema = z.object({
  name: z.string().trim().max(120),
  password: z.string().min(1).max(1024),
  passwordRepeat: z.string().min(1).max(1024),
});

export type AcceptErrorCode = 'invalid' | 'mismatch' | 'tooShort' | 'compromised' | 'rejected';

function fail(token: string, code: AcceptErrorCode): never {
  redirect(`${invitationPath(token)}?error=${code}`);
}

export async function acceptInvitationAction(token: string, formData: FormData): Promise<void> {
  try {
    await assertRequestIntegrity(formData);
  } catch {
    fail(token, 'rejected');
  }

  const parsed = schema.safeParse({
    name: formData.get('name') ?? '',
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
  const result = await acceptInvitation(
    token,
    { name: parsed.data.name, password: parsed.data.password },
    context.ipAddress,
  );

  if (!result.ok) {
    if (result.error.kind === 'INVALID') {
      fail(token, 'invalid');
    }

    const first = result.error.violations[0];
    fail(token, first?.kind === 'COMPROMISED' ? 'compromised' : 'tooShort');
  }

  // Keine automatische Anmeldung: Ein Link, der eine Sitzung eröffnet, wäre ein
  // Passwortersatz mit sieben Tagen Gültigkeit — und läge in einem Postfach.
  redirect(`${LOGIN_PATH}?eingerichtet=1`);
}
