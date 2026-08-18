/**
 * Stellt einen Einrichtungslink für ein Betreiberkonto aus (M8, FA-ADM-06, -08).
 *
 *     npm run admin:create -- --email betreiber@example.org
 *
 * **Das Konto entsteht hier nicht.** Ausgegeben wird ein Link, der 24 Stunden
 * gilt und genau einmal funktioniert; Passwort und zweiter Faktor werden im
 * Browser gesetzt, der QR-Code kommt aus dem eigenen Prozess. Der `AdminUser`
 * entsteht beim Einlösen, vollständig, in einer Transaktion.
 *
 * **Warum nicht mehr hier.** Bis M8 legte dieses Kommando das Konto unmittelbar
 * an und gab das TOTP-Geheimnis aus. Sicher war das — ein Betreiberkonto ohne
 * zweiten Faktor gab es nie —, aber das Geheimnis musste durch einen Scrollback
 * und von Hand abgetippt werden. Jetzt geht weder Passwort noch Geheimnis durch
 * ein Terminal.
 *
 * **Was ausdrücklich nicht gebaut wurde:** Konto mit Passwort anlegen und die
 * Einrichtung beim ersten Login erzwingen. Das wäre bequemer gewesen und hätte
 * die Zusage aus FA-ADM-08 aufgegeben: Zwischen Anlage und erster Anmeldung
 * stünde ein Konto, das nur ein Passwort kennt, und wer sich zuerst anmeldet,
 * richtet **seinen** Authenticator ein.
 *
 * **Nicht in einer Migration**, wie zuvor: Ein vorbelegtes Konto brauchte ein
 * Passwort, und ein Passwort in einer Migration steht im Repository
 * (NFA-SEC-21).
 */
import { stdout } from 'node:process';

import { inviteAdmin } from '@/application/admin/admin-setup';
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

/**
 * Der vollständige Link, wie er weitergegeben wird.
 *
 * Aus `APP_URL` und nicht aus einer Anfrage — es gibt hier keine. Zeigt die
 * Einstellung auf die falsche Adresse, ist der Link unbrauchbar, und das fällt
 * sofort auf: Er wird ja unmittelbar geöffnet.
 */
function absoluteLink(token: string): string {
  return `${getEnv().APP_URL.replace(/\/$/u, '')}${adminSetupPath(token)}`;
}

async function main(): Promise<void> {
  const email = parseEmailArgument(process.argv)?.trim().toLowerCase();

  if (email === undefined || email === null || !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)) {
    stdout.write('Aufruf: npm run admin:create -- --email <adresse>\n');
    process.exitCode = 1;
    return;
  }

  const result = await inviteAdmin(email);

  if (!result.ok) {
    stdout.write(`Es existiert bereits ein Betreiberkonto mit der Adresse ${email}.\n`);
    process.exitCode = 1;
    return;
  }

  const hours = String(Math.round(ADMIN_SETUP_TTL_MS / (60 * 60 * 1000)));

  // Absichtlich über `stdout` und nicht über den Logger: Der Link ist ein
  // Geheimnis und darf nirgends abgelegt werden (NFA-BETR-10).
  stdout.write(`\nEinrichtungslink für ${email}:\n\n`);
  stdout.write(`  ${absoluteLink(result.value.token)}\n\n`);
  stdout.write(
    `Der Link gilt ${hours} Stunden und funktioniert genau einmal. Passwort und ` +
      'zweiter Faktor werden dort gesetzt; erst danach existiert das Konto. Ein ' +
      'erneuter Aufruf dieses Kommandos entwertet den Link.\n',
  );
}

try {
  await main();
} catch (error) {
  logger.error('admin.invitation_failed', { error });
  process.exitCode = 1;
} finally {
  await disconnectDatabase();
}
