/**
 * Legt ein Betreiberkonto an (M8, FA-ADM-06).
 *
 * Das erste Konto der zentralen Verwaltung entsteht ausschließlich hier:
 *
 *     npm run admin:create -- --email betreiber@example.org
 *
 * **Nicht in einer Migration.** Ein vorbelegtes Konto brauchte ein Passwort,
 * und ein Passwort in einer Migration steht im Repository (NFA-SEC-21).
 *
 * **Der zweite Faktor entsteht mit dem Konto** (FA-ADM-08). Betreiberkonten
 * führen ihn verpflichtend; gäbe es einen Weg, eines ohne anzulegen, wäre die
 * Zusage eine Empfehlung. Das Geheimnis erscheint deshalb genau einmal hier —
 * wie die Wiederherstellungscodes in der Oberfläche. Wer es verliert, legt ein
 * neues Konto an; Wiederherstellungscodes gibt es für die Verwaltung nicht.
 *
 * Das Passwort wird verdeckt abgefragt. Als Argument stünde es in der
 * Shell-Historie und in der Prozessliste (NFA-BETR-10).
 */
import { createInterface } from 'node:readline/promises';
import { stdin, stdout } from 'node:process';

import {
  MIN_PASSWORD_LENGTH,
  type PasswordViolation,
  validatePassword,
} from '@/domain/auth/password-policy';
import { isCompromisedPassword } from '@/infrastructure/auth/compromised-passwords';
import { hashPassword } from '@/infrastructure/auth/password-hasher';
import { buildTotpUri, generateTotpSecret } from '@/infrastructure/auth/totp';
import { getEnv } from '@/infrastructure/config/env';
import { logger } from '@/infrastructure/logging/logger';
import { disconnectDatabase } from '@/infrastructure/repositories/client';
import {
  createAdminUser,
  findAdminUserByEmail,
} from '@/infrastructure/repositories/platform-repository';

function parseEmailArgument(argv: readonly string[]): string | null {
  const index = argv.indexOf('--email');
  if (index === -1) {
    return null;
  }
  return argv[index + 1] ?? null;
}

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

async function main(): Promise<void> {
  const email = parseEmailArgument(process.argv)?.trim().toLowerCase();

  if (email === undefined || email === null || !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)) {
    stdout.write('Aufruf: npm run admin:create -- --email <adresse>\n');
    process.exitCode = 1;
    return;
  }

  if ((await findAdminUserByEmail(email)) !== null) {
    stdout.write(`Es existiert bereits ein Betreiberkonto mit der Adresse ${email}.\n`);
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

  // Der zweite Faktor entsteht zusammen mit dem Konto — nicht später, nicht
  // wahlweise (FA-ADM-08).
  const totpSecret = generateTotpSecret();

  const admin = await createAdminUser({
    email,
    passwordHash: await hashPassword(password),
    totpSecret,
    totpEnabled: true,
  });

  // Absichtlich über `stdout` und nicht über den Logger: Das Geheimnis darf
  // nirgends abgelegt werden, und der Logger entfernt es ohnehin (NFA-BETR-10).
  stdout.write(`\nBetreiberkonto ${email} angelegt.\n\n`);
  stdout.write('Zweiter Faktor — dieses Geheimnis erscheint genau einmal:\n\n');
  stdout.write(`  Geheimnis: ${totpSecret}\n`);
  stdout.write(`  URI:       ${buildTotpUri(totpSecret, email, getEnv().APP_NAME)}\n\n`);
  stdout.write(
    'In der Authenticator-App eintragen und die Anmeldung sofort erproben. ' +
      'Ohne den zweiten Faktor ist das Konto nicht benutzbar; ein verlorenes ' +
      'Geheimnis lässt sich nur durch ein neues Konto ersetzen.\n',
  );

  logger.security('admin.account_created', { adminUserId: admin.id }, 'info');
}

try {
  await main();
} catch (error) {
  logger.error('admin.create_failed', { error });
  process.exitCode = 1;
} finally {
  closePipedInput();
  await disconnectDatabase();
}
