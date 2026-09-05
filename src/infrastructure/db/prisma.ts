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
 * Zwischenspeicher am globalen Objekt entstünde dabei pro Reload ein neuer
 * Verbindungspool, bis die Datenbank keine Verbindungen mehr annimmt.
 */
import { PrismaClient } from '@prisma/client';

import { getEnv } from '@/infrastructure/config/env';
import { withImmutabilityGuards } from '@/infrastructure/db/immutability';

const globalForPrisma = globalThis as unknown as {
  prismaClient: PrismaClient | undefined;
};

/**
 * Seit M17 ohne `connection_limit=1`.
 *
 * Unter SQLite war die Grenze notwendig: Die Datenbank lässt genau einen
 * Schreiber zu, und nebenläufige Transaktionen — etwa zwei Festschreibungen zur
 * selben Zeit (FA-NUM-04) — liefen sonst in einen Socket-Timeout, statt
 * nacheinander abzulaufen. Genau diese Grenze machte aber auch mehrere
 * Anwendungsinstanzen unmöglich.
 *
 * PostgreSQL serialisiert selbst, auf Zeilenebene. Die Lückenlosigkeit des
 * Nummernkreises hängt seither nicht mehr an einer einzelnen Verbindung,
 * sondern daran, dass `incrementSequence` ein einziges `INSERT … ON CONFLICT
 * DO UPDATE` ist — atomar, auch wenn zwei Instanzen gleichzeitig festschreiben.
 * `tests/integration/numbering-concurrency.test.ts` weist das nach.
 */
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

  // Ausschließlich der abgesicherte Client verlässt diese Datei: Die
  // Unveränderbarkeit festgeschriebener Belege und des Protokolls gilt damit
  // für jeden Zugriff, nicht nur für die Use Cases, die daran denken.
  const guarded = withImmutabilityGuards(created);

  client = guarded;
  if (env.NODE_ENV !== 'production') {
    globalForPrisma.prismaClient = guarded;
  }

  return guarded;
}
