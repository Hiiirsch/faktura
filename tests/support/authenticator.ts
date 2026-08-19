/**
 * Ein Authenticator aus `node:crypto` (M9).
 *
 * **Warum das nötig ist.** WebAuthn ist eine Browser-API; ohne Browser gibt es
 * keine Zeremonie. Ein Browsertest allein genügt aber nicht: Er kann die Fälle
 * nicht herstellen, auf die es ankommt — eine falsche Herkunft, ein
 * zurückgesetzter Zähler, eine abgelaufene Aufgabe. Ein echter Authenticator tut
 * so etwas nicht.
 *
 * Also wird hier einer nachgebaut: ein ES256-Schlüsselpaar, und die Antwort
 * selbst signiert. Damit lässt sich prüfen, was der Server aus einer Antwort
 * macht — und was er mit einer falschen macht.
 *
 * Der Browsertest bleibt daneben nötig: Er beweist, dass die Zeremonie im echten
 * Chromium durchläuft. Beide Ebenen prüfen Verschiedenes, und keine ersetzt die
 * andere.
 */
import { createHash, createSign, generateKeyPairSync, randomBytes } from 'node:crypto';

/** Die Flaggen im `authenticatorData` (WebAuthn §6.1). */
const FLAG_USER_PRESENT = 0x01;
const FLAG_USER_VERIFIED = 0x04;
const FLAG_ATTESTED_CREDENTIAL_DATA = 0x40;

function base64url(input: Buffer): string {
  return input.toString('base64url');
}

/**
 * Der öffentliche Schlüssel als COSE-Key (ES256, P-256).
 *
 * Von Hand zusammengesetzt, weil `node:crypto` DER liefert und WebAuthn CBOR
 * erwartet. Die Struktur ist fest: fünf Einträge, feste Reihenfolge, feste
 * Längen — deshalb ist das hier eine Aneinanderreihung von Bytes und keine
 * CBOR-Bibliothek.
 */
function coseKeyFrom(rawPublicKey: Buffer): Buffer {
  // Unkomprimierter Punkt: 0x04 | X (32) | Y (32).
  const x = rawPublicKey.subarray(1, 33);
  const y = rawPublicKey.subarray(33, 65);

  return Buffer.concat([
    Buffer.from([0xa5]), // Map mit 5 Einträgen
    Buffer.from([0x01, 0x02]), // kty: EC2
    Buffer.from([0x03, 0x26]), // alg: ES256 (-7)
    Buffer.from([0x20, 0x01]), // crv: P-256
    Buffer.from([0x21, 0x58, 0x20]), // x: Bytes, 32 lang
    x,
    Buffer.from([0x22, 0x58, 0x20]), // y: Bytes, 32 lang
    y,
  ]);
}

/**
 * Ein `attestationObject` ohne Attestierung (`fmt: "none"`).
 *
 * Die Anwendung verlangt keine — `attestationType: 'none'`. Damit ist der
 * Aufbau minimal: eine Map aus drei Einträgen, davon zwei leer.
 */
function attestationObjectFrom(authData: Buffer): Buffer {
  return Buffer.concat([
    Buffer.from([0xa3]), // Map mit 3 Einträgen
    Buffer.from([0x63]), // Text, 3 Zeichen
    Buffer.from('fmt', 'utf8'),
    Buffer.from([0x64]), // Text, 4 Zeichen
    Buffer.from('none', 'utf8'),
    Buffer.from([0x67]), // Text, 7 Zeichen
    Buffer.from('attStmt', 'utf8'),
    Buffer.from([0xa0]), // leere Map
    Buffer.from([0x68]), // Text, 8 Zeichen
    Buffer.from('authData', 'utf8'),
    Buffer.from([0x58, authData.length]), // Bytes, Länge
    authData,
  ]);
}

function authenticatorData(
  rpId: string,
  counter: number,
  attested: { readonly credentialId: Buffer; readonly coseKey: Buffer } | null,
): Buffer {
  const rpIdHash = createHash('sha256').update(rpId, 'utf8').digest();

  const flags =
    FLAG_USER_PRESENT |
    FLAG_USER_VERIFIED |
    (attested === null ? 0 : FLAG_ATTESTED_CREDENTIAL_DATA);

  const counterBytes = Buffer.alloc(4);
  counterBytes.writeUInt32BE(counter);

  if (attested === null) {
    return Buffer.concat([rpIdHash, Buffer.from([flags]), counterBytes]);
  }

  const idLength = Buffer.alloc(2);
  idLength.writeUInt16BE(attested.credentialId.length);

  return Buffer.concat([
    rpIdHash,
    Buffer.from([flags]),
    counterBytes,
    Buffer.alloc(16), // AAGUID — bei `fmt: "none"` bedeutungslos
    idLength,
    attested.credentialId,
    attested.coseKey,
  ]);
}

export type FakeAuthenticator = {
  readonly credentialId: string;
  /** Erzeugt die Antwort auf eine Registrierungsaufgabe. */
  register: (challenge: string, origin: string, rpId: string) => Record<string, unknown>;
  /**
   * Erzeugt die Antwort auf eine Anmeldeaufgabe.
   *
   * `counter` lässt sich überschreiben, um einen **Klon** nachzustellen: Ein
   * Wert, der nicht größer ist als der gespeicherte, ist der Hinweis darauf.
   */
  authenticate: (
    challenge: string,
    origin: string,
    rpId: string,
    userHandle: string,
    counter?: number,
  ) => Record<string, unknown>;
};

export function createFakeAuthenticator(): FakeAuthenticator {
  const { privateKey, publicKey } = generateKeyPairSync('ec', { namedCurve: 'prime256v1' });
  const rawPublicKey = Buffer.from(
    publicKey.export({ type: 'spki', format: 'der' }).subarray(-65),
  );
  const coseKey = coseKeyFrom(rawPublicKey);
  const credentialId = randomBytes(32);

  let counter = 0;

  function clientData(type: string, challenge: string, origin: string): Buffer {
    return Buffer.from(
      JSON.stringify({ type, challenge, origin, crossOrigin: false }),
      'utf8',
    );
  }

  function sign(authData: Buffer, clientDataJson: Buffer): Buffer {
    const hash = createHash('sha256').update(clientDataJson).digest();
    return createSign('SHA256').update(Buffer.concat([authData, hash])).sign(privateKey);
  }

  return {
    credentialId: base64url(credentialId),

    register(challenge, origin, rpId) {
      counter += 1;
      const clientDataJson = clientData('webauthn.create', challenge, origin);
      const authData = authenticatorData(rpId, counter, { credentialId, coseKey });

      return {
        id: base64url(credentialId),
        rawId: base64url(credentialId),
        type: 'public-key',
        clientExtensionResults: {},
        response: {
          clientDataJSON: base64url(clientDataJson),
          attestationObject: base64url(attestationObjectFrom(authData)),
          transports: ['internal'],
        },
      };
    },

    authenticate(challenge, origin, rpId, userHandle, override) {
      counter = override ?? counter + 1;
      const clientDataJson = clientData('webauthn.get', challenge, origin);
      const authData = authenticatorData(rpId, counter, null);

      return {
        id: base64url(credentialId),
        rawId: base64url(credentialId),
        type: 'public-key',
        clientExtensionResults: {},
        response: {
          clientDataJSON: base64url(clientDataJson),
          authenticatorData: base64url(authData),
          signature: base64url(sign(authData, clientDataJson)),
          userHandle: base64url(Buffer.from(userHandle, 'utf8')),
        },
      };
    },
  };
}
