/**
 * Gesamte Konfiguration über Umgebungsvariablen (NFA-BETR-02).
 *
 * Das Schema wird beim ersten Zugriff ausgewertet und bricht mit einer klaren
 * Meldung ab, wenn etwas fehlt oder unplausibel ist. Damit scheitert ein
 * fehlkonfigurierter Container beim Start und nicht erst beim ersten Request.
 */
import { z } from 'zod';

const supportedTimeZones = new Set(Intl.supportedValuesOf('timeZone'));

/**
 * Eine leere Variable heißt „nicht eingerichtet", nicht „ungültig".
 *
 * `SMTP_URL=` in einer `.env` ist die übliche Art, etwas abzuschalten, ohne die
 * Zeile zu verlieren. Ohne diese Vorstufe fiele der Wert durch `min(1)` und die
 * **gesamte** Konfiguration wäre ungültig — die Anwendung startete nicht, mit
 * einer Meldung über eine Variable, die der Betreiber gerade ausschalten
 * wollte.
 *
 * Dieselbe Regel macht die Testläufe verlässlich: Die Integrationstests setzen
 * beide Werte auf leer und sind damit unabhängig davon, was in der `.env` des
 * Entwicklers steht. Das ist kein Nebenzweck, sondern der Anlass — ein Lauf mit
 * ausgefüllter `.env` hat echte Post an erfundene Adressen verschickt.
 */
function leerIstUnkonfiguriert<T extends z.ZodType>(schema: T): z.ZodType<z.output<T>> {
  return z.preprocess(
    (wert) => (typeof wert === 'string' && wert.trim() === '' ? undefined : wert),
    schema,
  );
}

const envSchema = z.object({
  NODE_ENV: z.enum(['development', 'test', 'production']).default('development'),

  /** PostgreSQL-Verbindung, z. B. `postgresql://faktura:…@db:5432/faktura`. */
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

  /*
   * Objektspeicher (M17, B2) — **optional**.
   *
   * Ohne diese Werte legt Faktura Dateien auf dem lokalen Dateisystem ab, genau
   * wie bisher. Mit ihnen landen sie in einem S3-kompatiblen Speicher, den sich
   * mehrere Anwendungsinstanzen teilen können.
   *
   * Dieselbe Bauart wie beim Mailversand seit M14: „nicht eingerichtet" ist ein
   * Zustand, keine Ausnahme. Wer nichts konfiguriert, merkt von der Möglichkeit
   * nichts.
   */
  S3_ENDPOINT: z.string().url().optional(),
  S3_BUCKET: z.string().min(1).optional(),
  S3_ACCESS_KEY_ID: z.string().min(1).optional(),
  S3_SECRET_ACCESS_KEY: z.string().min(1).optional(),
  /** Viele S3-kompatible Dienste kennen nur eine Region; `us-east-1` ist die übliche. */
  S3_REGION: z.string().min(1).default('us-east-1'),

  /*
   * Renderdienst (M17, B3) — **optional**.
   *
   * Ohne `RENDERER_URL` setzt die Anwendung Belege im eigenen Prozess, wie
   * bisher. Mit ihr geht der Auftrag an einen eigenen Dienst — nötig überall
   * dort, wo die Anwendungsinstanz die Fähigkeiten für die Chromium-Sandbox
   * nicht bekommen kann.
   *
   * `RENDERER_TOKEN` ist ein gemeinsames Geheimnis. Der Dienst nimmt HTML
   * entgegen und setzt es; ohne Nachweis wäre er ein Werkzeug zum Erzeugen
   * beliebiger Dokumente für jeden, der ihn erreicht.
   */
  RENDERER_URL: z.string().url().optional(),
  RENDERER_TOKEN: z.string().min(16).optional(),

  /**
   * Pfad zu einem vorhandenen Chromium (Spec §8.2, §11.3).
   *
   * Ohne Angabe nimmt Playwright den mitgelieferten Browser — der Weg für die
   * lokale Entwicklung. Das Container-Image installiert stattdessen das
   * Chromium der Distribution und setzt diese Variable: So kommt der Browser
   * über die Paketverwaltung an Sicherheitsaktualisierungen, statt als
   * eingefrorener Download im Image zu liegen.
   */
  CHROMIUM_PATH: z.string().min(1).optional(),

  /**
   * Der Mailserver, über den zugestellt wird (M14, NFA-COMP-05 in neuer
   * Fassung).
   *
   * **Optional, und ohne ihn bleibt alles wie vorher.** Die Anwendung
   * funktioniert vollständig ohne ausgehende Verbindung; wer keinen Versand
   * einrichtet, bekommt weiterhin jeden Link genau einmal in der Oberfläche zu
   * sehen. Der Versand ist eine Zugabe, kein Bestandteil eines Vorgangs.
   *
   * **Eine Adresse statt sechs Einzelwerte**
   * (`smtps://benutzer:kennwort@host:465`): Wer einen Mailserver einrichtet,
   * hat diese Zeichenkette vom Anbieter; sie in Wirt, Anschluss, Benutzer,
   * Kennwort, Verschlüsselung und Zertifikatsprüfung zu zerlegen verteilt eine
   * Angabe auf sechs Stellen, an denen sie einzeln falsch sein kann.
   *
   * Die Zugangsdaten stehen ausschließlich hier und nie im Repository
   * (NFA-SEC-21).
   */
  SMTP_URL: leerIstUnkonfiguriert(z.string().min(1).optional()),

  /** Absenderadresse. Ohne sie wird nicht zugestellt, auch nicht mit `SMTP_URL`. */
  MAIL_FROM: leerIstUnkonfiguriert(z.string().min(3).optional()),
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
