/**
 * Strukturierte Protokollierung auf stdout (NFA-BETR-09, -10).
 *
 * **Eine Zeile, ein JSON-Objekt.** Wer Logs später durchsuchen will — nach
 * einem Zeitraum, nach einem Ereignis, nach fehlgeschlagenen Anmeldungen —,
 * kann das mit `jq` tun, ohne eine Textzeile zu zerlegen, deren Form sich mit
 * der nächsten Änderung verschiebt. Auf **stdout**, nicht in eine Datei: Der
 * Container schreibt dorthin, und was damit geschieht, entscheidet der
 * Betrieb, nicht die Anwendung.
 *
 * **Sicherheitsrelevante Ereignisse sind als solche erkennbar** (NFA-BETR-09):
 * Sie tragen `category: 'security'` und lassen sich damit in einem Feld
 * herausfiltern, statt an Wortlauten erkannt werden zu müssen.
 *
 * **Was nie ins Log gerät** (NFA-BETR-10): Passwörter, Token, Geheimnisse,
 * Hashes und vollständige Kundendatensätze. Das ist hier nicht dem Aufrufer
 * überlassen — `redact()` durchsucht jedes Feld rekursiv nach verräterischen
 * Namen und ersetzt den Wert. Eine Regel, die nur in einem Kommentar steht,
 * wird beim ersten hastigen `logger.error('...', user)` gebrochen; eine, die
 * im Schreibweg sitzt, nicht.
 *
 * Ohne Importe aus `node:*`: Der Proxy läuft in der Edge-Laufzeit und
 * protokolliert dort ebenfalls.
 */

export type LogLevel = 'debug' | 'info' | 'warn' | 'error';

/** Frei belegbare Felder eines Ereignisses. */
export type LogFields = Record<string, unknown>;

/**
 * Feldnamen, deren Wert nie ausgegeben wird.
 *
 * Absichtlich als Teilzeichenkette geprüft und großzügig gefasst: `tokenHash`,
 * `passwordHash`, `totpSecret` und `csrfToken` sollen alle greifen, ohne dass
 * jemand daran denken muss, sie einzeln einzutragen. Ein zu weit gefasster
 * Filter kostet eine Auskunft im Log; ein zu enger kostet ein Geheimnis.
 */
const SECRET_KEY_PATTERN =
  /pass|secret|token|hash|credential|authorization|cookie|session|recovery|totp|iban|bic/i;

/** Was anstelle des Wertes erscheint. */
export const REDACTED = '[entfernt]';

/**
 * Wie viele Zeichen einer Zeichenkette höchstens im Log landen.
 *
 * Ein abgeschnittener Wert ist eine Auskunft; ein vollständiger Datensatz im
 * Log ist eine Kopie personenbezogener Daten an einem Ort, an dem niemand sie
 * verwaltet.
 */
const MAX_STRING_LENGTH = 200;

function redactValue(value: unknown, depth: number): unknown {
  if (depth > 4) {
    return REDACTED;
  }

  if (typeof value === 'string') {
    return value.length > MAX_STRING_LENGTH ? `${value.slice(0, MAX_STRING_LENGTH)}…` : value;
  }

  if (typeof value === 'number' || typeof value === 'boolean' || value === null) {
    return value;
  }

  if (value instanceof Date) {
    return value.toISOString();
  }

  if (value instanceof Error) {
    // Der Stacktrace gehört ins Log — er gehört nur nicht in die Antwort an
    // den Client (NFA-SEC-18).
    return { name: value.name, message: value.message, stack: value.stack };
  }

  if (Array.isArray(value)) {
    return value.slice(0, 20).map((entry) => redactValue(entry, depth + 1));
  }

  if (typeof value === 'object') {
    return redact(value as LogFields, depth + 1);
  }

  // Funktionen, Symbole, `undefined` — nichts, was in ein Protokoll gehört.
  return undefined;
}

export function redact(fields: LogFields, depth = 0): LogFields {
  const result: LogFields = {};

  for (const [key, value] of Object.entries(fields)) {
    if (SECRET_KEY_PATTERN.test(key)) {
      result[key] = REDACTED;
      continue;
    }

    const cleaned = redactValue(value, depth);
    if (cleaned !== undefined) {
      result[key] = cleaned;
    }
  }

  return result;
}

/** Der Schreibweg — in Tests ersetzbar, im Betrieb stdout. */
type Sink = (line: string) => void;

let sink: Sink = (line) => {
  // `process.stdout` steht in der Edge-Laufzeit nicht zur Verfügung;
  // `console.log` schreibt in beiden Umgebungen dorthin.
  console.log(line);
};

/** Setzt den Schreibweg. Ausschließlich für Tests gedacht. */
export function setLogSink(next: Sink): () => void {
  const previous = sink;
  sink = next;
  return () => {
    sink = previous;
  };
}

function emit(level: LogLevel, event: string, fields: LogFields): void {
  const entry = {
    ts: new Date().toISOString(),
    level,
    event,
    ...redact(fields),
  };

  sink(JSON.stringify(entry));
}

export const logger = {
  debug: (event: string, fields: LogFields = {}): void => {
    emit('debug', event, fields);
  },
  info: (event: string, fields: LogFields = {}): void => {
    emit('info', event, fields);
  },
  warn: (event: string, fields: LogFields = {}): void => {
    emit('warn', event, fields);
  },
  error: (event: string, fields: LogFields = {}): void => {
    emit('error', event, fields);
  },
  /**
   * Ein sicherheitsrelevantes Ereignis (NFA-BETR-09).
   *
   * Fehlgeschlagene Anmeldung, gesperrtes Konto, abgewiesene Herkunft,
   * fehlender CSRF-Token. Sie tragen `category: 'security'`, damit sie sich in
   * einem Feld herausfiltern lassen.
   */
  security: (event: string, fields: LogFields = {}, level: LogLevel = 'warn'): void => {
    emit(level, event, { ...fields, category: 'security' });
  },
};
