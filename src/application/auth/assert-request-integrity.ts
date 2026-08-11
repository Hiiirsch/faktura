/**
 * Prüfung schreibender Anfragen auf Herkunft und CSRF-Token (NFA-SEC-10).
 *
 * Beide Prüfungen zusammen, wie in Spec §11.2 verlangt: die Herkunft schließt
 * fremde Seiten aus, der Token schließt Anfragen aus, die die Herkunftsangabe
 * unterdrücken oder fälschen könnten.
 *
 * Zur Diagnose: Eine abweichende Herkunft ist im Betrieb fast nie ein Angriff,
 * sondern eine falsch gesetzte `APP_URL` — und sie legt dann **jede**
 * schreibende Aktion lahm, die Anmeldung eingeschlossen. Der Client erfährt
 * davon nichts (NFA-SEC-18), aber das Serverlog nennt beide Werte im Klartext.
 * Ohne diese Zeile sucht man blind.
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

/** Beschreibt eine Herkunftsabweichung so, dass sie sich beheben lässt. */
export function describeOriginMismatch(originHeader: string | null, appUrl: string): string {
  const actual = originHeader === null || originHeader.length === 0 ? '(keine)' : originHeader;
  return (
    `Herkunft der Anfrage (${actual}) stimmt nicht mit APP_URL (${appUrl}) überein. ` +
    'Solange beide auseinanderlaufen, wird jede schreibende Aktion abgelehnt — ' +
    'auch die Anmeldung. Bitte APP_URL auf die Adresse setzen, unter der die ' +
    'Anwendung im Browser aufgerufen wird, und den Dienst neu starten.'
  );
}

/**
 * Muss in jeder schreibenden Server Action als erste Anweisung stehen — noch
 * vor der Sitzungsprüfung, damit eine fremd ausgelöste Anfrage gar nicht erst
 * eine Datenbankabfrage auslöst.
 */
export async function assertRequestIntegrity(formData: FormData): Promise<void> {
  const headerList = await headers();
  const appUrl = getEnv().APP_URL;
  const origin = headerList.get('origin');

  if (!isSameOrigin(origin, appUrl)) {
    console.error(`[csrf] ${describeOriginMismatch(origin, appUrl)}`);
    throw new RequestIntegrityError('Herkunft stimmt nicht überein');
  }

  const cookieValue = (await cookies()).get(CSRF_COOKIE_NAME)?.value;
  if (!isValidCsrfPair(cookieValue, formData.get(CSRF_FIELD_NAME))) {
    console.error(
      '[csrf] CSRF-Token fehlt oder passt nicht zum Cookie. Häufigste Ursache: Die Seite lag ' +
        'lange offen, oder das Cookie wurde zwischenzeitlich gelöscht. Seite neu laden.',
    );
    throw new RequestIntegrityError('CSRF-Token fehlt oder stimmt nicht überein');
  }
}
