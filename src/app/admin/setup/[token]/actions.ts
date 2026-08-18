'use server';

import { redirect } from 'next/navigation';
import { z } from 'zod';

import { completeAdminSetup } from '@/application/admin/admin-setup';
import { assertRequestIntegrity } from '@/application/auth/assert-request-integrity';
import { ADMIN_LOGIN_PATH, adminSetupPath } from '@/routes';

/**
 * Ein Betreiberkonto einrichten — **ohne Sitzung**.
 *
 * Kein `requireAdminSession`: Wer hier ankommt, hat noch kein Konto; es entsteht
 * erst durch diese Aktion. Der Nachweis ist der Token in der Adresse.
 * `assertRequestIntegrity` bleibt trotzdem die erste Anweisung — ein fremd
 * ausgelöstes Absenden dieses Formulars legte ein Betreiberkonto an.
 *
 * Einfache Server Action statt `useActionState`: Wie die Anmeldung muss dieses
 * Formular **ohne JavaScript** funktionieren. Es ist die erste Seite einer
 * frischen Installation, und sie ist kein Ort für einen Rückschlag.
 */

const schema = z.object({
  name: z.string().trim().max(120),
  password: z.string().min(1).max(1024),
  passwordRepeat: z.string().min(1).max(1024),
  code: z.string().trim().min(1).max(20),
});

export type AdminSetupErrorCode =
  | 'invalid'
  | 'mismatch'
  | 'tooShort'
  | 'compromised'
  | 'code'
  | 'taken'
  | 'rejected';

function fail(token: string, code: AdminSetupErrorCode): never {
  redirect(`${adminSetupPath(token)}?error=${code}`);
}

export async function completeAdminSetupAction(
  token: string,
  formData: FormData,
): Promise<void> {
  try {
    await assertRequestIntegrity(formData);
  } catch {
    fail(token, 'rejected');
  }

  const parsed = schema.safeParse({
    name: formData.get('name') ?? '',
    password: formData.get('password'),
    passwordRepeat: formData.get('passwordRepeat'),
    code: formData.get('code'),
  });

  if (!parsed.success) {
    fail(token, 'tooShort');
  }
  if (parsed.data.password !== parsed.data.passwordRepeat) {
    fail(token, 'mismatch');
  }

  const result = await completeAdminSetup(token, {
    name: parsed.data.name,
    password: parsed.data.password,
    code: parsed.data.code,
  });

  if (!result.ok) {
    /*
     * `fail` kehrt nie zurück (`redirect` wirft), aber ESLint sieht das dem
     * Rückgabetyp `never` nicht an und liest jeden Zweig als Durchfall. Ein
     * `break` daneben wäre toter Code — deshalb eine Zuordnung statt eines
     * `switch` mit Seiteneffekten.
     */
    const code: AdminSetupErrorCode =
      result.error.kind === 'INVALID'
        ? 'invalid'
        : result.error.kind === 'INVALID_CODE'
          ? 'code'
          : result.error.kind === 'EMAIL_TAKEN'
            ? 'taken'
            : result.error.violations[0]?.kind === 'COMPROMISED'
              ? 'compromised'
              : 'tooShort';

    fail(token, code);
  }

  // Keine automatische Anmeldung: Der zweite Faktor ist gerade erst eingerichtet
  // und soll sich auf demselben Weg bewähren, den das Konto künftig geht.
  redirect(`${ADMIN_LOGIN_PATH}?eingerichtet=1`);
}
