/**
 * Legt ein Benutzerkonto an (NFA-SEC-02, Spec §11.1).
 *
 * Es gibt keine öffentliche Registrierung. Der Erstbenutzer entsteht
 * ausschließlich über dieses Kommando auf dem Server:
 *
 *     npm run user:create -- --email buchhaltung@example.org
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
import { getPrismaClient } from '@/infrastructure/db/prisma';

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
    stdout.write('Aufruf: npm run user:create -- --email <adresse>\n');
    process.exitCode = 1;
    return;
  }

  const prisma = getPrismaClient();

  const existing = await prisma.user.findUnique({ where: { email } });
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

  const user = await prisma.user.create({
    data: { email, passwordHash: await hashPassword(password) },
  });

  await recordAuditEntry({
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
  await getPrismaClient().$disconnect();
}
