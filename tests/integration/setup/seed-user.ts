/**
 * Legt das Prüfkonto für die Integrationstests an.
 *
 * Bewusst nicht über `scripts/create-user.ts`: Das Kommando fragt das Passwort
 * verdeckt ab und ist damit nicht automatisierbar. Der Weg über dieselben
 * Infrastrukturfunktionen prüft dieselbe Hashing-Konfiguration.
 */
import { hashPassword } from '@/infrastructure/auth/password-hasher';
import { getPrismaClient } from '@/infrastructure/db/prisma';

const EMAIL = 'pruefung@example.org';
/** Eigenes Konto für den Sperrtest — es wird dabei für 15 Minuten gesperrt. */
const LOCKOUT_EMAIL = 'sperre@example.org';
const PASSWORD = 'Zwetschgenkuchen-mit-Streuseln-7';

const prisma = getPrismaClient();
const passwordHash = await hashPassword(PASSWORD);

for (const email of [EMAIL, LOCKOUT_EMAIL]) {
  await prisma.user.upsert({
    where: { email },
    update: {},
    create: { email, passwordHash },
  });
}

await prisma.$disconnect();
