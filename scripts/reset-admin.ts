/**
 * Setzt ein Betreiberkonto zurück (M8, FA-ADM-06).
 *
 *     npm run admin:reset -- --email betreiber@example.org
 *
 * Für den Fall, dass der Authenticator verloren ist. Für Betreiberkonten gibt es
 * **keine Wiederherstellungscodes** — ohne diesen Weg bliebe nur ein Eingriff in
 * die Datenbank, und der ist kein Verfahren, sondern ein Notbehelf.
 *
 * **Das Konto bleibt bestehen.** Es wird sofort gesperrt, alle Sitzungen enden,
 * und es entsteht ein Einrichtungslink; beim Einlösen bekommt dasselbe Konto
 * neue Zugangsdaten. Löschen und neu anlegen wäre einfacher gewesen und hätte
 * das Protokoll beschädigt: Es nennt den Betreiber über seine Kennung, und die
 * eines gelöschten Kontos zeigt ins Leere.
 *
 * **Gesperrt ab sofort**, nicht erst beim Einlösen: Wer zurücksetzt, tut das,
 * weil etwas abhandengekommen ist. Bis der Nachweis eingelöst ist, soll auch ein
 * bekanntes Passwort nicht mehr genügen. Der Preis ist benannt: Zwischen Aufruf
 * und Einlösen kommt niemand in die Verwaltung.
 */
import { stdout } from 'node:process';

import { resetAdmin } from '@/application/admin/admin-setup';
import { ADMIN_SETUP_TTL_MS } from '@/domain/auth/admin-setup-policy';
import { getEnv } from '@/infrastructure/config/env';
import { logger } from '@/infrastructure/logging/logger';
import { disconnectDatabase } from '@/infrastructure/repositories/client';
import { adminSetupPath } from '@/routes';

function parseEmailArgument(argv: readonly string[]): string | null {
  const index = argv.indexOf('--email');
  if (index === -1) {
    return null;
  }
  return argv[index + 1] ?? null;
}

function absoluteLink(token: string): string {
  return `${getEnv().APP_URL.replace(/\/$/u, '')}${adminSetupPath(token)}`;
}

async function main(): Promise<void> {
  const email = parseEmailArgument(process.argv)?.trim().toLowerCase();

  if (email === undefined || email === null || !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)) {
    stdout.write('Aufruf: npm run admin:reset -- --email <adresse>\n');
    process.exitCode = 1;
    return;
  }

  const result = await resetAdmin(email);

  if (!result.ok) {
    // Ursache und Ausweg, wie bei `admin:create` — nur in die andere Richtung.
    stdout.write(
      `Es existiert kein Betreiberkonto mit der Adresse ${email}.\n\n` +
        'Ein neues entsteht mit:\n\n' +
        `  npm run admin:create -- --email ${email}\n` +
        `  im Container: node dist/create-admin.mjs --email ${email}\n`,
    );
    process.exitCode = 1;
    return;
  }

  const hours = String(Math.round(ADMIN_SETUP_TTL_MS / (60 * 60 * 1000)));

  // Absichtlich über `stdout` und nicht über den Logger: Der Link ist ein
  // Geheimnis und darf nirgends abgelegt werden (NFA-BETR-10).
  stdout.write(`\nDas Konto ${email} ist gesperrt, alle Sitzungen sind beendet.\n\n`);
  stdout.write('Einrichtungslink:\n\n');
  stdout.write(`  ${absoluteLink(result.value.token)}\n\n`);
  stdout.write(
    `Der Link gilt ${hours} Stunden und funktioniert genau einmal. Beim Einlösen ` +
      'bekommt dasselbe Konto ein neues Passwort und einen neuen zweiten Faktor; ' +
      'seine Spuren im Protokoll bleiben erhalten. Bis dahin kommt niemand in die ' +
      'Verwaltung.\n',
  );
}

try {
  await main();
} catch (error) {
  logger.error('admin.reset_failed', { error });
  process.exitCode = 1;
} finally {
  await disconnectDatabase();
}
