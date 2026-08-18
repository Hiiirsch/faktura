/**
 * Legt ein Mandantenkonto an — der **Notfallweg** (NFA-SEC-02, Spec §11.1).
 *
 * Es gibt keine öffentliche Registrierung. Im Regelfall entsteht ein Konto über
 * eine Einladung (M8, FA-MEMB-01); dieses Kommando bleibt für den Fall, dass
 * niemand mehr hineinkommt — ein Unternehmen ohne aktive Rechteverwaltung, eine
 * verlorene Einladung, eine Datenbank ohne Betreiberkonto.
 *
 *     npm run user:create -- --email buchhaltung@example.org \
 *       --organization org_default --role role_owner_org_default
 *
 * `--organization` ist seit M8 **Pflicht**. Vorher riet das Kommando die
 * Organisation, wenn es genau eine gab; bei mehreren wäre das Raten falsch, und
 * die Wahl gehört nicht in eine Heuristik.
 *
 * `--role` ist wahlweise. Ohne Rolle trägt das Konto nur die Grundrechte
 * (`BASE_PERMISSIONS`) und sieht eine Anwendung ohne Inhalt — für ein
 * Notfallkonto in aller Regel nicht, was gemeint ist.
 *
 * Das Passwort wird verdeckt abgefragt. Als Argument wäre es in der
 * Shell-Historie und in der Prozessliste sichtbar (NFA-BETR-10).
 */
import { createInterface } from 'node:readline/promises';
import { stdin, stdout } from 'node:process';

import {
  MIN_PASSWORD_LENGTH,
  type PasswordViolation,
  validatePassword,
} from '@/domain/auth/password-policy';
import { recordAuditEntry } from '@/infrastructure/audit/audit-log';
import { isCompromisedPassword } from '@/infrastructure/auth/compromised-passwords';
import { hashPassword } from '@/infrastructure/auth/password-hasher';
import { createUser, findUserByEmail } from '@/infrastructure/repositories/auth-repository';
import { disconnectDatabase } from '@/infrastructure/repositories/client';
import {
  organizationContextOf,
} from '@/infrastructure/repositories/organization-context';
import { findOrganization, listOrganizations } from '@/infrastructure/repositories/organization-repository';
import { findRole } from '@/infrastructure/repositories/role-repository';

function parseArgument(argv: readonly string[], name: string): string | null {
  const index = argv.indexOf(name);
  if (index === -1) {
    return null;
  }
  return argv[index + 1] ?? null;
}

const USAGE =
  'Aufruf: npm run user:create -- --email <adresse> --organization <kennung> ' +
  '[--role <kennung>]\n';

function describeViolation(violation: PasswordViolation): string {
  switch (violation.kind) {
    case 'TOO_SHORT':
      return `Das Passwort muss mindestens ${String(violation.minLength)} Zeichen haben.`;
    case 'TOO_LONG':
      return `Das Passwort darf höchstens ${String(violation.maxLength)} Zeichen haben.`;
    case 'COMPROMISED':
      return 'Dieses Passwort steht in einer Liste bekannter Leaks und ist unsicher.';
  }
}

/**
 * Liest eine Eingabe, ohne sie im Terminal darzustellen.
 *
 * Ohne Terminal — etwa wenn die Eingabe aus einer Datei stammt — wird zeilenweise
 * gelesen; das Ausblenden hätte dort keine Bedeutung.
 */
let pipedLines: AsyncIterator<string> | undefined;
let pipedInterface: ReturnType<typeof createInterface> | undefined;

function closePipedInput(): void {
  pipedInterface?.close();
  pipedInterface = undefined;
  pipedLines = undefined;
}

async function readSecret(prompt: string): Promise<string> {
  if (!stdin.isTTY) {
    // Die Leseschnittstelle wird über beide Abfragen hinweg offen gehalten:
    // Eine zweite Instanz auf demselben bereits gelesenen Datenstrom fände
    // keine Zeile mehr vor.
    pipedInterface ??= createInterface({ input: stdin });
    pipedLines ??= pipedInterface[Symbol.asyncIterator]();
    const result = await pipedLines.next();
    return result.done === true ? '' : result.value;
  }

  stdout.write(prompt);

  return new Promise<string>((resolve, reject) => {
    const wasRaw = stdin.isRaw;
    stdin.setRawMode(true);
    stdin.resume();

    let value = '';

    const finish = (settle: () => void): void => {
      stdin.removeListener('data', onData);
      stdin.setRawMode(wasRaw);
      stdin.pause();
      stdout.write('\n');
      settle();
    };

    const onData = (chunk: Buffer): void => {
      for (const byte of chunk) {
        switch (byte) {
          case 0x03: // Strg+C
            finish(() => {
              reject(new Error('Abgebrochen'));
            });
            return;
          case 0x0d: // Wagenrücklauf
          case 0x0a: // Zeilenvorschub
            finish(() => {
              resolve(value);
            });
            return;
          case 0x7f: // Rücktaste
          case 0x08:
            value = value.slice(0, -1);
            break;
          default:
            if (byte >= 0x20) {
              value += String.fromCharCode(byte);
            }
        }
      }
    };

    stdin.on('data', onData);
  });
}

/** Nennt die vorhandenen Organisationen, damit niemand raten muss. */
async function writeKnownOrganizations(): Promise<void> {
  const all = await listOrganizations();

  if (all.length === 0) {
    stdout.write(
      'Es gibt keine Organisation. Zuerst die Migrationen anwenden (npm run db:deploy) ' +
        'und ein Unternehmen in der Verwaltung anlegen.\n',
    );
    return;
  }

  stdout.write('Vorhandene Organisationen:\n');
  for (const organization of all) {
    stdout.write(`  ${organization.id}  ${organization.name}\n`);
  }
}

async function main(): Promise<void> {
  const email = parseArgument(process.argv, '--email')?.trim().toLowerCase();
  const organizationId = parseArgument(process.argv, '--organization')?.trim();
  const roleId = parseArgument(process.argv, '--role')?.trim();

  if (email === undefined || email === null || !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)) {
    stdout.write(USAGE);
    process.exitCode = 1;
    return;
  }

  /*
   * `--organization` ist Pflicht (M8).
   *
   * Bis M8 riet das Kommando: die eine Organisation, die es gab. Mit mehreren
   * Mandanten wäre das Raten eine Zuweisung in ein fremdes Unternehmen — und
   * zwar eine stille.
   */
  if (organizationId === undefined || organizationId === null || organizationId.length === 0) {
    stdout.write(USAGE);
    await writeKnownOrganizations();
    process.exitCode = 1;
    return;
  }

  if ((await findOrganization(organizationId)) === null) {
    stdout.write(`Unbekannte Organisation: ${organizationId}\n`);
    await writeKnownOrganizations();
    process.exitCode = 1;
    return;
  }

  const organization = organizationContextOf(organizationId);

  // Eine Rolle aus einem **anderen** Unternehmen wäre ein Konto mit fremden
  // Rechten. `findRole` sucht mit dem Kontext; der Trigger
  // `User_role_matches_organization_insert` ist die Ebene darunter.
  if (roleId !== undefined && roleId !== null && roleId.length > 0) {
    if ((await findRole(organization, roleId)) === null) {
      stdout.write(`Unbekannte Rolle in dieser Organisation: ${roleId}\n`);
      process.exitCode = 1;
      return;
    }
  }

  const existing = await findUserByEmail(email);
  if (existing !== null) {
    stdout.write(`Es existiert bereits ein Konto mit der Adresse ${email}.\n`);
    process.exitCode = 1;
    return;
  }

  stdout.write(
    `Passwort für ${email} festlegen (mindestens ${String(MIN_PASSWORD_LENGTH)} Zeichen).\n`,
  );

  const password = await readSecret('Passwort: ');
  const violations = validatePassword(password, isCompromisedPassword);

  if (violations.length > 0) {
    for (const violation of violations) {
      stdout.write(`Abgelehnt: ${describeViolation(violation)}\n`);
    }
    process.exitCode = 1;
    return;
  }

  const repeated = await readSecret('Passwort wiederholen: ');
  if (repeated !== password) {
    stdout.write('Abgelehnt: Die Eingaben stimmen nicht überein.\n');
    process.exitCode = 1;
    return;
  }

  const user = await createUser({
    email,
    passwordHash: await hashPassword(password),
    organizationId,
    ...(roleId === undefined || roleId === null || roleId.length === 0 ? {} : { roleId }),
  });

  await recordAuditEntry(organization, {
    entityType: 'User',
    entityId: user.id,
    action: 'USER_CREATED',
    details: { email },
  });

  stdout.write(`Konto ${email} angelegt.\n`);
  stdout.write(
    'Die Zweifaktorauthentifizierung lässt sich nach der ersten Anmeldung unter ' +
      'Einstellungen › Sicherheit aktivieren.\n',
  );
}

try {
  await main();
} catch (error) {
  stdout.write(`Fehlgeschlagen: ${error instanceof Error ? error.message : 'unbekannter Fehler'}\n`);
  process.exitCode = 1;
} finally {
  closePipedInput();
  await disconnectDatabase();
}
