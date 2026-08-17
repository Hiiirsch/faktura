/**
 * Die Sollbruchstelle des Berechtigungsmodells (M8, NFA-SEC-24, -26).
 *
 * `Authorized<K>` schützt so lange, wie es **den einen Weg** dorthin gibt:
 * `authorize()`, und die prüft. Es gibt genau drei Arten, diesen Weg zu
 * umgehen, und alle drei sind eine Zeile Arbeit:
 *
 * 1. Einen Anwendungsfall wieder auf `OrganizationContext` umstellen. Dann
 *    genügt `session.organization`, und niemand merkt, dass die Prüfung fehlt —
 *    denn es kompiliert.
 * 2. `organizationContextOf()` selbst aufrufen. Damit lässt sich ein Kontext für
 *    **eine beliebige Organisation** herstellen, notfalls aus einem
 *    Formularfeld. Das hebt nicht die Rechteprüfung auf, sondern die
 *    Mandantengrenze.
 * 3. `fullyAuthorized()` im Anwendungscode aufrufen — ein Nachweis über alle
 *    Rechte, ausgestellt an niemanden.
 *
 * Keine der drei ist ein Typfehler. Deshalb steht hier für jede eine
 * Erlaubnisliste. Wer sie erweitert, tut es sichtbar im Diff und muss
 * begründen, was er da hinzufügt.
 *
 * Dieser Test liest Quelltext. Das ist unscharf und würde als einzige Sicherung
 * nicht genügen — er ist die zweite Ebene hinter dem Übersetzer, so wie
 * `design-tokens.test.ts` die zweite Ebene hinter den gelöschten Tailwind-Skalen
 * ist.
 */
import { readFileSync } from 'node:fs';
import { readdir } from 'node:fs/promises';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

import { describe, expect, it } from 'vitest';

const projectRoot = fileURLToPath(new URL('../..', import.meta.url));

async function collect(directory: string): Promise<readonly string[]> {
  const entries = await readdir(path.join(projectRoot, directory), { withFileTypes: true });
  const files: string[] = [];

  for (const entry of entries) {
    const relative = path.join(directory, entry.name);
    if (entry.isDirectory()) {
      files.push(...(await collect(relative)));
    } else if (entry.name.endsWith('.ts') || entry.name.endsWith('.tsx')) {
      files.push(relative);
    }
  }

  return files;
}

function sourceOf(file: string): string {
  return readFileSync(path.join(projectRoot, file), 'utf8');
}

/**
 * Wer `OrganizationContext` in der Anwendungsschicht noch nennen darf.
 *
 * Alle vier stehen **vor** oder **neben** der Rechteprüfung, nicht dahinter:
 *
 * - `session-service.ts` stellt den Kontext her, wenn die Sitzung aufgelöst
 *   wird. Zu diesem Zeitpunkt sind die Rechte gerade erst gelesen.
 * - `authorize.ts` verwandelt ihn in den Nachweis — das ist ihre Aufgabe.
 * - `login.ts` arbeitet vor der Sitzung: Es gibt noch kein Konto, dessen Rechte
 *   man nachsehen könnte.
 * - `event-dispatcher.ts` gibt den Kontext an Ereignis-Handler weiter. Der
 *   Handler ist kein Anwendungsfall, sondern eine Folge eines bereits
 *   geprüften — und `Authorized<K>` ist an `OrganizationContext` zuweisbar, der
 *   Aufrufer verliert dabei nichts.
 * - `admin/**` führt gar keinen Mandantenkontext; die Nennung dort ist die
 *   Aussage, dass es keinen gibt (geprüft in `platform-repository.test.ts`).
 */
const MAY_NAME_ORGANIZATION_CONTEXT: readonly string[] = [
  'src/application/auth/session-service.ts',
  'src/application/auth/authorize.ts',
  'src/application/auth/login.ts',
  'src/application/invoices/event-dispatcher.ts',
];

/**
 * Wer `organizationContextOf` aufrufen darf.
 *
 * Zwei Stellen im Anwendungscode, beide mit belegter Herkunft: Die Sitzung nennt
 * die Organisation des angemeldeten Kontos, die Anmeldung die des Kontos, dessen
 * Passwort gerade stimmte. Dazu die Skripte, die keine Sitzung haben.
 */
const MAY_CALL_ORGANIZATION_CONTEXT_OF: readonly string[] = [
  'src/infrastructure/repositories/organization-context.ts',
  'src/application/auth/session-service.ts',
  'src/application/auth/login.ts',
  // Einlösen einer Einladung und einer Passwortzurücksetzung (M8). Derselbe
  // Grund wie bei der Anmeldung: Wer den Token vorlegt, ist noch niemand — die
  // Organisation ist das *Ergebnis* der Abfrage. Die beiden Vorgänge stehen
  // deshalb in einer eigenen Datei, damit die Ausnahme nicht neben Funktionen
  // liegt, die einen Kontext verlangen, und deren Vorbild wird.
  'src/application/members/redeem.ts',
  // `defaultOrganizationContext()` — der Notfallweg `npm run user:create` hat
  // keine Sitzung. Die Herkunft ist trotzdem belegt, nur anders: „die eine
  // Organisation, die es gibt". Erreichbar ist die Funktion nur von der
  // Kommandozeile, nicht aus einer Route.
  'src/infrastructure/repositories/organization-repository.ts',
  'scripts/create-user.ts',
  'scripts/seed.ts',
];

/**
 * Wer `fullyAuthorized` aufrufen darf — niemand im Anwendungscode.
 *
 * Die Skripte laufen ohne Sitzung; Tests der Fachlogik wollen Fachlogik prüfen
 * und nicht Rechtevergabe. Beides ist kein Grund, den Nachweis irgendwo
 * auszustellen, wo eine Sitzung zur Hand ist.
 */
const MAY_CALL_FULLY_AUTHORIZED: readonly string[] = [
  'src/application/auth/authorize.ts',
  'scripts/seed.ts',
];

describe('NFA-SEC-24 Jeder Anwendungsfall verlangt einen Nachweis', () => {
  it('nennt `OrganizationContext` nur an den vier vorgesehenen Stellen', async () => {
    const files = await collect('src/application');

    const offenders = files.filter(
      (file) =>
        !MAY_NAME_ORGANIZATION_CONTEXT.includes(file) &&
        !file.startsWith(`src${path.sep}application${path.sep}admin${path.sep}`) &&
        /\bOrganizationContext\b/u.test(sourceOf(file)),
    );

    expect(offenders).toEqual([]);
  });

  /**
   * Die Gegenprobe zur Liste: Sie darf nicht dadurch leer laufen, dass es den
   * Nachweis nirgends mehr gibt. Geprüft wird deshalb, dass er tatsächlich
   * breit verlangt wird.
   */
  it('verlangt den Nachweis in der Breite, nicht an drei Stellen', async () => {
    const files = await collect('src/application');

    const using = files.filter((file) => /Authorized</u.test(sourceOf(file)));

    expect(using.length).toBeGreaterThanOrEqual(15);
  });

  /**
   * Und die Anwendungsschicht stellt sich den Nachweis nicht selbst aus.
   *
   * `authorize.ts` ist die einzige Datei, die `as Authorized` schreiben darf —
   * dort ist der Cast die Definition der Marke. Überall sonst wäre er ihre
   * Umgehung.
   */
  it('markiert einen Kontext nur in `authorize.ts` von Hand', async () => {
    const files = [...(await collect('src/application')), ...(await collect('src/app'))];

    const offenders = files.filter(
      (file) =>
        file !== 'src/application/auth/authorize.ts' &&
        /as\s+(?:Authorized|FullyAuthorized)\b/u.test(sourceOf(file)),
    );

    expect(offenders).toEqual([]);
  });
});

describe('NFA-SEC-26 Die Aufrufstellen der Kontexterzeugung sind aufgezählt', () => {
  it('ruft `organizationContextOf` nur mit belegter Herkunft auf', async () => {
    const files = [
      ...(await collect('src/application')),
      ...(await collect('src/app')),
      ...(await collect('src/infrastructure')),
      ...(await collect('scripts')),
    ];

    const offenders = files.filter(
      (file) =>
        !MAY_CALL_ORGANIZATION_CONTEXT_OF.includes(file) &&
        /organizationContextOf\s*\(/u.test(sourceOf(file)),
    );

    expect(offenders).toEqual([]);
  });

  it('stellt `fullyAuthorized` nirgends im Anwendungscode aus', async () => {
    const files = [
      ...(await collect('src/application')),
      ...(await collect('src/app')),
      ...(await collect('src/infrastructure')),
      ...(await collect('scripts')),
    ];

    const offenders = files.filter(
      (file) =>
        !MAY_CALL_FULLY_AUTHORIZED.includes(file) && /fullyAuthorized\s*\(/u.test(sourceOf(file)),
    );

    expect(offenders).toEqual([]);
  });
});

describe('FA-ROLE-03 Jede Server Action prüft, bevor sie schreibt', () => {
  /**
   * Der Reihenfolgebeweis, den der Übersetzer nicht führt.
   *
   * Dass ein Nachweis nötig ist, garantiert `Authorized<K>`. Dass er **vor** der
   * Arbeit geholt wird und nicht erst hinter einer Datenbankabfrage, garantiert
   * nichts — außer dieser Prüfung: In jeder Datei mit Server Actions steht
   * `authorize(` vor dem ersten Aufruf eines Anwendungsfalls.
   *
   * Geprüft über die Textstellen, nicht über den Syntaxbaum: `authorize(` muss
   * früher vorkommen als `session.userId` — der Wert, den jeder schreibende
   * Anwendungsfall für das Protokoll bekommt und der damit zuverlässig neben
   * dem eigentlichen Aufruf steht.
   */
  it('holt den Nachweis vor dem ersten Anwendungsfall', async () => {
    const files = (await collect('src/app')).filter(
      (file) => file.endsWith('actions.ts') && !file.includes(`admin${path.sep}`),
    );

    /*
     * Zwei Ausnahmen, beide inhaltlich:
     *
     * - Die Anmeldung läuft ohne Sitzung; es gibt nichts zu prüfen.
     * - Das **Abmelden** darf an keinem Recht hängen. Ein Konto, dem alle Rechte
     *   entzogen wurden, muss sich noch abmelden können — sonst ließe eine
     *   Rechteänderung jemanden in einer Sitzung sitzen, die er nicht beenden
     *   kann. `logoutAction` benutzt den Mandantenkontext nur für den
     *   Protokolleintrag.
     * - Die beiden **Einlösewege** (Einladung, Passwortzurücksetzung) liegen
     *   ebenfalls vor der Sitzung. Ihr Nachweis ist der Token in der Adresse,
     *   und ein Recht zu verlangen wäre hier unmöglich: Das Konto entsteht erst
     *   dabei, oder sein Inhaber kommt gerade nicht hinein.
     */
    const withoutSession = [
      'src/app/auth-actions.ts',
      `src/app/invitations/[token]${path.sep}actions.ts`,
      `src/app/password-reset/[token]${path.sep}actions.ts`,
    ];

    const relevant = files.filter(
      (file) => !file.includes(`login${path.sep}`) && !withoutSession.includes(file),
    );
    expect(relevant.length).toBeGreaterThanOrEqual(6);

    const offenders: string[] = [];

    for (const file of relevant) {
      const source = sourceOf(file);
      const check = source.indexOf('authorize(session');
      const use = source.indexOf('session.userId');

      if (check === -1 || (use !== -1 && use < check)) {
        offenders.push(file);
      }
    }

    expect(offenders).toEqual([]);
  });
});
