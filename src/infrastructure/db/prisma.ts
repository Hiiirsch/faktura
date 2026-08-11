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
import { withImmutabilityGuards } from '@/infrastructure/db/immutability';

const globalForPrisma = globalThis as unknown as {
  prismaClient: PrismaClient | undefined;
};

/**
 * SQLite lässt genau einen Schreiber zu. Mehrere gleichzeitige Verbindungen
 * bringen deshalb keinen Durchsatz, sondern Konkurrenz: Nebenläufige
 * Transaktionen — etwa zwei Festschreibungen zur selben Zeit (FA-NUM-04) —
 * liefen sonst in einen Socket-Timeout, statt nacheinander abzulaufen.
 *
 * Eine einzelne Verbindung mit großzügigem Wartezeitfenster serialisiert die
 * Zugriffe sauber. Der Wert wird nur ergänzt, wenn ihn die Konfiguration nicht
 * bereits vorgibt.
 */
function withSqliteConcurrencySettings(url: string): string {
  if (!url.startsWith('file:')) {
    return url;
  }

  const [base, query = ''] = url.split('?');
  const params = new URLSearchParams(query);

  if (!params.has('connection_limit')) {
    params.set('connection_limit', '1');
  }
  if (!params.has('socket_timeout')) {
    params.set('socket_timeout', '30');
  }

  return `${base ?? url}?${params.toString()}`;
}

let client: PrismaClient | undefined;

export function getPrismaClient(): PrismaClient {
  const cached = globalForPrisma.prismaClient ?? client;
  if (cached !== undefined) {
    return cached;
  }

  const env = getEnv();
  const created = new PrismaClient({
    log: env.NODE_ENV === 'development' ? ['warn', 'error'] : ['error'],
    datasources: { db: { url: withSqliteConcurrencySettings(env.DATABASE_URL) } },
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
