/**
 * Zugang zur Datenbank. Der gesamte Datenbankzugriff läuft über diesen Client
 * (NFA-ARCH-10) — Roh-SQL ist per Lint-Regel ausgeschlossen.
 *
 * Der Client wird erst beim ersten Zugriff erzeugt, nicht beim Import des
 * Moduls. Sonst verlangte schon das Einlesen der Datei eine vollständige
 * Konfiguration, und der Produktionsbuild — der die Seiten analysiert, ohne
 * Zugangsdaten zu besitzen — scheiterte.
 *
 * Im Entwicklungsmodus lädt Next.js Module bei jeder Änderung neu. Ohne
 * Zwischenspeicher am globalen Objekt entstünde dabei pro Reload eine neue
 * Verbindung, bis SQLite die Grenze erreicht.
 */
import { PrismaClient } from '@prisma/client';

import { getEnv } from '@/infrastructure/config/env';

const globalForPrisma = globalThis as unknown as {
  prismaClient: PrismaClient | undefined;
};

let client: PrismaClient | undefined;

export function getPrismaClient(): PrismaClient {
  const cached = globalForPrisma.prismaClient ?? client;
  if (cached !== undefined) {
    return cached;
  }

  const env = getEnv();
  const created = new PrismaClient({
    log: env.NODE_ENV === 'development' ? ['warn', 'error'] : ['error'],
    datasources: { db: { url: env.DATABASE_URL } },
  });

  client = created;
  if (env.NODE_ENV !== 'production') {
    globalForPrisma.prismaClient = created;
  }

  return created;
}
