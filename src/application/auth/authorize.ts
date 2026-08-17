/**
 * Durchsetzung der Berechtigungen (M8, FA-ROLE-03, NFA-SEC-24).
 *
 * `can()` entscheidet, was die Oberfläche **zeigt**. Diese Datei entscheidet,
 * was der Server **tut** — und das ist der eigentliche Schutz: Ein verstecktes
 * Formularfeld lässt sich von Hand nachbauen, ein fehlender Knopf hält niemanden
 * auf.
 *
 * **Dasselbe Muster, ein zweites Mal.** Seit M5.5a verhindert
 * `OrganizationContext` einen vergessenen Mandantenfilter, indem er ein
 * *Typfehler* ist statt eines übersehenen `where`. `Authorized<K>` macht daraus
 * einen vergessenen Rechtecheck:
 *
 * ```ts
 * // vorher                                     // nachher
 * issueInvoice(context: OrganizationContext)    issueInvoice(context: Authorized<'invoice.issue'>)
 * ```
 *
 * `session.organization` allein passt danach in keinen Anwendungsfall mehr. Wer
 * einen aufrufen will, muss durch `authorize()` gehen — und die prüft.
 *
 * **Die Marke trägt eine Menge, nicht einen Wert.** Sie ist ein Datensatz aus
 * Flaggen (`{ 'invoice.read': true }`), nicht der Schlüssel selbst. Nur so
 * stimmt die Zuweisbarkeit in die richtige Richtung: `Authorized<'a' | 'b'>`
 * heißt „beide geprüft" und passt überall hin, wo `Authorized<'a'>` verlangt
 * wird. Trüge die Marke den Schlüssel als Wert, wären `Authorized<'a' | 'b'>`
 * und `Authorized<'a'>` gegenseitig unzuweisbar, und jede Stelle, die zwei
 * Rechte braucht, bräuchte einen Ausweg.
 *
 * **Die Repository-Schicht bleibt unverändert.** `Authorized<K>` ist eine
 * Schnittmenge mit `OrganizationContext` und damit dort zuweisbar, wo bisher
 * schon ein Mandantenkontext erwartet wurde. Die Verschärfung wirkt genau eine
 * Schicht höher — da, wo die Entscheidung fällt.
 */
import { notFound, redirect } from 'next/navigation';

import { holds, type PermissionKey } from '@/domain/policy/can';
import { logger } from '@/infrastructure/logging/logger';
import type { OrganizationContext } from '@/infrastructure/repositories/organization-context';
import { LOGIN_PATH } from '@/routes';

import { getOptionalSession } from './require-session';
import type { ActiveSession } from './session-service';

declare const authorizedBrand: unique symbol;

/**
 * Ein Mandantenkontext samt Nachweis, dass die genannten Rechte geprüft wurden.
 *
 * Herstellbar allein durch `authorize()`. Ein `as`-Cast wäre der einzige Weg
 * daran vorbei, und danach sucht `tests/architecture/authorization.test.ts`.
 */
export type Authorized<K extends PermissionKey> = OrganizationContext & {
  readonly [authorizedBrand]: { readonly [P in K]: true };
};

/**
 * Ein Nachweis über **alle** Rechte.
 *
 * Für das Einrichtungsskript und für Tests der Fachlogik, die keine Sitzung
 * haben und keine prüfen wollen. Nicht im Anwendungscode: Dort gibt es immer
 * eine Sitzung, und dann gibt es keinen Grund, die Prüfung zu überspringen.
 */
export type FullyAuthorized = Authorized<PermissionKey>;

/**
 * Stellt einen Nachweis über alle Rechte aus, **ohne** zu prüfen.
 *
 * Für Aufrufer ohne Sitzung: das Einrichtungsskript, das Beispieldatenskript und
 * Integrationstests der Fachlogik. Sie haben kein Konto, dessen Rechte man
 * nachsehen könnte, und die Prüfung wäre eine Behauptung über niemanden.
 *
 * Bewusst als benannte Funktion statt als `as`-Cast an der Aufrufstelle: Ein
 * Cast wäre überall unsichtbar, diese Funktion ist greppbar. Ihre Aufrufstellen
 * stehen — wie die von `organizationContextOf` — in der Erlaubnisliste von
 * `tests/architecture/authorization.test.ts`. In `src/app` und
 * `src/application` hat sie nichts zu suchen: Dort gibt es immer eine Sitzung,
 * und dann gibt es keinen Grund, die Prüfung zu überspringen.
 */
export function fullyAuthorized(context: OrganizationContext): FullyAuthorized {
  return context as FullyAuthorized;
}

/**
 * Ein Recht fehlt.
 *
 * Nach dem Muster von `RequestIntegrityError`: Der Vorgang bricht ab, bevor er
 * etwas schreibt, und das Serverlog nennt den fehlenden Schlüssel. Der Client
 * erfährt nur, dass es nicht ging (NFA-SEC-18) — welches Recht fehlt, ist eine
 * Auskunft über die Rechtevergabe des Unternehmens.
 */
export class ForbiddenError extends Error {
  constructor(readonly permission: PermissionKey) {
    super(`Berechtigung fehlt: ${permission}`);
    this.name = 'ForbiddenError';
  }
}

/**
 * Prüft die genannten Rechte und liefert den Nachweis.
 *
 * Mehrere Schlüssel bedeuten **und**, nicht **oder**: Der Nachweis behauptet,
 * dass alle geprüft wurden, und wird deshalb nur ausgestellt, wenn alle gelten.
 */
export function authorize<K extends PermissionKey>(
  session: ActiveSession,
  ...keys: readonly K[]
): Authorized<K> {
  for (const key of keys) {
    if (!holds(session.actor, key)) {
      logger.security('authz.denied', { permission: key, userId: session.userId }, 'warn');
      throw new ForbiddenError(key);
    }
  }

  return session.organization as Authorized<K>;
}

/**
 * Wie `authorize`, liefert aber `null` statt zu werfen — und **schweigt**.
 *
 * Für Seiten, die einen **Abschnitt** nur zeigen, wenn das Recht vorliegt: Die
 * Kundenseite listet die Belege des Kunden, aber ein Konto ohne `invoice.read`
 * sieht dort keine Belege statt gar keine Kundenseite.
 *
 * Ohne Protokolleintrag, im Unterschied zu `authorizeRequest`: Ein weggelassener
 * Abschnitt ist kein abgewiesener Zugriff. Würde er protokolliert, stünde bei
 * jedem Seitenaufruf eines eingeschränkten Kontos eine Warnung im Log, und die
 * echten Ablehnungen gingen darin unter.
 */
export function authorizeOptional<K extends PermissionKey>(
  session: ActiveSession,
  ...keys: readonly K[]
): Authorized<K> | null {
  for (const key of keys) {
    if (!holds(session.actor, key)) {
      return null;
    }
  }

  return session.organization as Authorized<K>;
}

/**
 * Die Sitzung, deren Mandantenkontext den Nachweis trägt.
 *
 * Als Schnittmenge gebildet, nicht mit `Omit`: `OrganizationContext &
 * Authorized<K>` ist `Authorized<K>`, und damit bleibt `session.organization`
 * überall dort verwendbar, wo es das vorher war.
 */
export type AuthorizedSession<K extends PermissionKey> = ActiveSession & {
  readonly organization: Authorized<K>;
};

/**
 * Für Routenhandler: der Nachweis oder `null`.
 *
 * Eine Route antwortet mit einem Status, nicht mit einer Seite — sie kann einen
 * geworfenen Fehler nicht in „403" verwandeln, ohne ihn zu fangen. Deshalb hier
 * ein Wert und keine Ausnahme. Anders als `authorizeOptional` wird die Ablehnung
 * protokolliert: Bei einer Route ist ein fehlendes Recht ein abgewiesener
 * Zugriff, kein weggelassener Abschnitt.
 */
export function authorizeRequest<K extends PermissionKey>(
  session: ActiveSession,
  ...keys: readonly K[]
): Authorized<K> | null {
  for (const key of keys) {
    if (!holds(session.actor, key)) {
      logger.security('authz.denied', { permission: key, userId: session.userId }, 'warn');
      return null;
    }
  }

  return session.organization as Authorized<K>;
}

/**
 * Für Seiten: Sitzung holen, Rechte prüfen, sonst raus.
 *
 * Ohne Sitzung zur Anmeldung — mit Sitzung, aber ohne Recht **404 statt 403**.
 * Ein 403 bestätigt, dass es die Seite gibt; die Seitenleiste zeigt einem Konto
 * ohne das Recht ohnehin keinen Weg dorthin, und ein Bereich, den man nicht
 * betreten darf, muss auch nicht bekannt sein. Der Grund steht im Serverlog.
 */
export async function requirePermission<K extends PermissionKey>(
  ...keys: readonly K[]
): Promise<AuthorizedSession<K>> {
  const session = await getOptionalSession();
  if (session === null) {
    redirect(LOGIN_PATH);
  }

  if (authorizeRequest(session, ...keys) === null) {
    notFound();
  }

  // Der Nachweis selbst wird nicht weitergegeben — die Sitzung trägt ihn danach
  // im Typ, und die Seite arbeitet weiter mit `session.organization`.
  return session as AuthorizedSession<K>;
}
