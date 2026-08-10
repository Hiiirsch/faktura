/**
 * Prüfung schreibender Anfragen auf Herkunft und CSRF-Token (NFA-SEC-10).
 *
 * Beide Prüfungen zusammen, wie in Spec §11.2 verlangt: die Herkunft schließt
 * fremde Seiten aus, der Token schließt Anfragen aus, die die Herkunftsangabe
 * unterdrücken oder fälschen könnten.
 */
import { cookies, headers } from 'next/headers';

import { getEnv } from '@/infrastructure/config/env';
import { CSRF_COOKIE_NAME, CSRF_FIELD_NAME, isSameOrigin } from '@/infrastructure/security/csrf';
import { isValidCsrfPair } from '@/infrastructure/security/csrf-verify';

export class RequestIntegrityError extends Error {
  constructor(reason: string) {
    super(`Anfrage abgelehnt: ${reason}`);
    this.name = 'RequestIntegrityError';
  }
}

/**
 * Muss in jeder schreibenden Server Action als erste Anweisung stehen — noch
 * vor der Sitzungsprüfung, damit eine fremd ausgelöste Anfrage gar nicht erst
 * eine Datenbankabfrage auslöst.
 */
export async function assertRequestIntegrity(formData: FormData): Promise<void> {
  const headerList = await headers();

  if (!isSameOrigin(headerList.get('origin'), getEnv().APP_URL)) {
    throw new RequestIntegrityError('Herkunft stimmt nicht überein');
  }

  const cookieValue = (await cookies()).get(CSRF_COOKIE_NAME)?.value;
  if (!isValidCsrfPair(cookieValue, formData.get(CSRF_FIELD_NAME))) {
    throw new RequestIntegrityError('CSRF-Token fehlt oder stimmt nicht überein');
  }
}
