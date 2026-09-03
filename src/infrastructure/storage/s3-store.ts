/**
 * Der Dateispeicher in einem S3-kompatiblen Objektspeicher (M17, B2).
 *
 * Nötig, sobald mehrere Anwendungsinstanzen gegen dieselbe Datenbank laufen:
 * Was die eine beim Festschreiben ablegt, muss die andere beim Abruf finden.
 *
 * **Ohne SDK, mit eigener Signatur.** Das ist eine bewusste Entscheidung, und
 * sie hat zwei Gründe:
 *
 * 1. Gebraucht werden **vier** Operationen — ablegen, lesen, löschen,
 *    auflisten. Ein SDK brächte den vollen Funktionsumfang von S3 mit, für
 *    dauerhaft vier Aufrufe.
 * 2. **Ein Signaturfehler scheitert laut.** Anders als beim handgeschriebenen
 *    tar-Schreiber, wo ein Fehler erst Jahre später beim Auspacken auffiele,
 *    antwortet ein Objektspeicher auf eine falsche Signatur sofort mit 403. Was
 *    hier schiefgehen kann, geht beim ersten Aufruf schief — und der steht im
 *    Integrationstest.
 *
 * **Pfadadressierung** (`https://host/bucket/key`) statt der Unterdomänenform:
 * MinIO, Ceph und Garage sprechen sie alle, und für einen Dienst im eigenen
 * Netz gibt es keine Wildcard-Zertifikate.
 *
 * Die Zugangsdaten stehen ausschließlich in der Umgebung (NFA-SEC-21) und
 * reisen nie über die Kommandozeile.
 */
import { createHash, createHmac } from 'node:crypto';

import { getEnv } from '@/infrastructure/config/env';

import type { FileStore } from './file-store';

const ALGORITHM = 'AWS4-HMAC-SHA256';
const SERVICE = 's3';

type S3Config = {
  readonly endpoint: string;
  readonly bucket: string;
  readonly region: string;
  readonly accessKeyId: string;
  readonly secretAccessKey: string;
};

function configuration(): S3Config {
  const env = getEnv();

  if (
    env.S3_ENDPOINT === undefined ||
    env.S3_BUCKET === undefined ||
    env.S3_ACCESS_KEY_ID === undefined ||
    env.S3_SECRET_ACCESS_KEY === undefined
  ) {
    throw new Error('Der Objektspeicher ist nicht vollständig eingerichtet.');
  }

  return {
    endpoint: env.S3_ENDPOINT.replace(/\/$/u, ''),
    bucket: env.S3_BUCKET,
    region: env.S3_REGION,
    accessKeyId: env.S3_ACCESS_KEY_ID,
    secretAccessKey: env.S3_SECRET_ACCESS_KEY,
  };
}

/** Ob ein Objektspeicher eingerichtet ist — sonst bleibt es beim Dateisystem. */
export function isObjectStoreConfigured(): boolean {
  const env = getEnv();
  return (
    env.S3_ENDPOINT !== undefined &&
    env.S3_BUCKET !== undefined &&
    env.S3_ACCESS_KEY_ID !== undefined &&
    env.S3_SECRET_ACCESS_KEY !== undefined
  );
}

function sha256Hex(value: Uint8Array | string): string {
  return createHash('sha256').update(value).digest('hex');
}

/**
 * Kodiert einen Pfadabschnitt nach RFC 3986.
 *
 * `encodeURIComponent` lässt `!'()*` stehen — AWS erwartet sie kodiert, und
 * eine Abweichung ergibt eine Signatur über einen anderen Text als den
 * gesendeten. Der Schrägstrich bleibt Trennzeichen und wird deshalb je
 * Abschnitt kodiert, nicht über den ganzen Schlüssel.
 */
function encodeSegment(value: string): string {
  return encodeURIComponent(value).replace(
    /[!'()*]/gu,
    (character) => `%${character.charCodeAt(0).toString(16).toUpperCase()}`,
  );
}

function encodeKey(key: string): string {
  return key.split('/').map(encodeSegment).join('/');
}

/** Der Signaturschlüssel: vier verkettete HMACs über Datum, Region, Dienst. */
function signingKey(secret: string, date: string, region: string): Buffer {
  const kDate = createHmac('sha256', `AWS4${secret}`).update(date).digest();
  const kRegion = createHmac('sha256', kDate).update(region).digest();
  const kService = createHmac('sha256', kRegion).update(SERVICE).digest();
  return createHmac('sha256', kService).update('aws4_request').digest();
}

type SignedRequest = {
  readonly url: string;
  readonly headers: Record<string, string>;
};

/**
 * Baut Adresse und Kopfzeilen einer signierten Anfrage.
 *
 * Die Reihenfolge ist die des Standards und nicht verhandelbar: kanonische
 * Anfrage → deren Hash → zu signierender Text → Signatur. Wer hier eine
 * Kopfzeile ergänzt, muss sie auch in `SignedHeaders` aufnehmen, sonst weist
 * der Dienst die Anfrage ab.
 */
function sign(
  config: S3Config,
  method: 'GET' | 'PUT' | 'DELETE',
  key: string,
  query: string,
  payload: Uint8Array,
  now: Date,
): SignedRequest {
  const amzDate = now.toISOString().replace(/[-:]/gu, '').replace(/\.\d{3}/u, '');
  const shortDate = amzDate.slice(0, 8);

  const host = new URL(config.endpoint).host;
  const canonicalPath = `/${encodeSegment(config.bucket)}${key === '' ? '' : `/${encodeKey(key)}`}`;
  const payloadHash = sha256Hex(payload);

  const canonicalHeaders =
    `host:${host}\n` + `x-amz-content-sha256:${payloadHash}\n` + `x-amz-date:${amzDate}\n`;
  const signedHeaders = 'host;x-amz-content-sha256;x-amz-date';

  const canonicalRequest = [
    method,
    canonicalPath,
    query,
    canonicalHeaders,
    signedHeaders,
    payloadHash,
  ].join('\n');

  const scope = `${shortDate}/${config.region}/${SERVICE}/aws4_request`;
  const stringToSign = [ALGORITHM, amzDate, scope, sha256Hex(canonicalRequest)].join('\n');

  const signature = createHmac('sha256', signingKey(config.secretAccessKey, shortDate, config.region))
    .update(stringToSign)
    .digest('hex');

  return {
    url: `${config.endpoint}${canonicalPath}${query === '' ? '' : `?${query}`}`,
    headers: {
      host,
      'x-amz-content-sha256': payloadHash,
      'x-amz-date': amzDate,
      Authorization:
        `${ALGORITHM} Credential=${config.accessKeyId}/${scope}, ` +
        `SignedHeaders=${signedHeaders}, Signature=${signature}`,
    },
  };
}

const EMPTY = new Uint8Array(0);

async function request(
  method: 'GET' | 'PUT' | 'DELETE',
  key: string,
  query: string,
  payload: Uint8Array,
): Promise<Response> {
  const config = configuration();
  const signed = sign(config, method, key, query, payload, new Date());

  /*
   * `new Uint8Array(payload)` und nicht `payload`: Seit TypeScript 5.7 ist
   * `Uint8Array` über seinen Puffer generisch, und `Uint8Array<ArrayBufferLike>`
   * erfüllt `BodyInit` nicht mehr. Die Kopie hat einen echten `ArrayBuffer` und
   * kostet bei einem PDF von wenigen hundert Kilobyte nichts Messbares — die
   * Alternative wäre ein `as`-Cast über eine Typlücke. Dieselbe Stelle gibt es
   * in der PDF-Route (`new NextResponse(new Uint8Array(…))`).
   */
  return method === 'PUT'
    ? fetch(signed.url, { method, headers: signed.headers, body: new Uint8Array(payload) })
    : fetch(signed.url, { method, headers: signed.headers });
}

/**
 * Die Schlüssel unter einem Präfix.
 *
 * Die Antwort ist XML. Statt eines Parsers steht hier ein Ausdruck über
 * `<Key>` — die Form dieser einen Antwort ist seit Jahren unverändert, und ein
 * XML-Parser für ein Element wäre eine Abhängigkeit für eine Zeile. Was der
 * Ausdruck nicht findet, wird nicht gelöscht; das ist die sichere Richtung.
 */
async function listKeys(prefix: string): Promise<readonly string[]> {
  const query = `list-type=2&prefix=${encodeSegment(prefix)}`;
  const response = await request('GET', '', query, EMPTY);

  if (!response.ok) {
    throw new Error(`Objektspeicher antwortete mit ${String(response.status)} beim Auflisten`);
  }

  const xml = await response.text();
  return [...xml.matchAll(/<Key>([^<]+)<\/Key>/gu)].flatMap((match) =>
    match[1] === undefined ? [] : [match[1]],
  );
}

export const s3Store: FileStore = {
  async put(key: string, bytes: Uint8Array): Promise<void> {
    const response = await request('PUT', key, '', bytes);

    if (!response.ok) {
      throw new Error(`Objektspeicher antwortete mit ${String(response.status)} beim Ablegen`);
    }
  },

  async get(key: string): Promise<Uint8Array> {
    const response = await request('GET', key, '', EMPTY);

    if (!response.ok) {
      throw new Error(`Objektspeicher antwortete mit ${String(response.status)} beim Lesen`);
    }

    return new Uint8Array(await response.arrayBuffer());
  },

  async remove(key: string): Promise<void> {
    const response = await request('DELETE', key, '', EMPTY);

    // 404 ist kein Fehler: Der Vertrag sagt, ein nicht vorhandener Schlüssel
    // ist keiner.
    if (!response.ok && response.status !== 404) {
      throw new Error(`Objektspeicher antwortete mit ${String(response.status)} beim Löschen`);
    }
  },

  async removePrefix(prefix: string): Promise<void> {
    for (const key of await listKeys(prefix)) {
      await s3Store.remove(key);
    }
  },
};

/** Nur für den Test der Signatur — sie ist der Teil, der still falsch sein kann. */
export const __testing = { sign, encodeKey };
