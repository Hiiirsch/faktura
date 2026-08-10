/**
 * Gesamte Konfiguration über Umgebungsvariablen (NFA-BETR-02).
 *
 * Das Schema wird beim ersten Zugriff ausgewertet und bricht mit einer klaren
 * Meldung ab, wenn etwas fehlt oder unplausibel ist. Damit scheitert ein
 * fehlkonfigurierter Container beim Start und nicht erst beim ersten Request.
 */
import { z } from 'zod';

const supportedTimeZones = new Set(Intl.supportedValuesOf('timeZone'));

const envSchema = z.object({
  NODE_ENV: z.enum(['development', 'test', 'production']).default('development'),

  /** SQLite-Verbindung, z. B. `file:/app/data/faktura.db`. */
  DATABASE_URL: z.string().min(1, 'DATABASE_URL darf nicht leer sein'),

  /** Öffentliche Basis-URL, unter der die Anwendung erreichbar ist. */
  APP_URL: z.url('APP_URL muss eine gültige URL sein'),

  /**
   * Name der Installation. Erscheint als Aussteller in der Authenticator-App
   * und unterscheidet dort mehrere Installationen voneinander.
   */
  APP_NAME: z.string().min(1).max(64).default('Faktura'),

  /**
   * Zeitzone der Anwendung. Bestimmt, welcher Kalendertag „heute" ist — und
   * damit die Fälligkeitsberechnung und die Zuordnung zu Umsatzmonaten.
   */
  APP_TIMEZONE: z
    .string()
    .refine((value) => supportedTimeZones.has(value), {
      message: 'APP_TIMEZONE muss eine gültige IANA-Zeitzone sein, z. B. Europe/Berlin',
    })
    .default('Europe/Berlin'),

  PORT: z.coerce.number().int().min(1).max(65535).default(3000),

  /**
   * Verzeichnis für hochgeladene Dateien und erzeugte Belege. Liegt außerhalb
   * des öffentlich ausgelieferten Verzeichnisses; die Auslieferung läuft
   * ausschließlich über authentifizierte Routen (NFA-SEC-16).
   */
  STORAGE_DIR: z.string().min(1).default('./storage'),
});

export type Env = z.infer<typeof envSchema>;

let cached: Env | undefined;

/**
 * Liefert die geprüfte Konfiguration. Wirft beim ersten Aufruf, falls die
 * Umgebung unvollständig ist — die Meldung nennt die betroffenen Variablen,
 * aber keine Werte (NFA-BETR-10).
 */
export function getEnv(): Env {
  if (cached !== undefined) {
    return cached;
  }

  const parsed = envSchema.safeParse(process.env);
  if (!parsed.success) {
    const details = parsed.error.issues
      .map((issue) => `${issue.path.join('.')}: ${issue.message}`)
      .join('\n  ');
    throw new Error(`Ungültige Konfiguration:\n  ${details}`);
  }

  cached = parsed.data;
  return cached;
}
