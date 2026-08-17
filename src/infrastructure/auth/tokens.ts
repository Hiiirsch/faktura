/**
 * Erzeugung und Ablage von Geheimnissen (NFA-SEC-06, Spec §11.1).
 *
 * Sitzungstoken haben 256 Bit Entropie. In der Datenbank liegt ausschließlich
 * der SHA-256-Hash: Wer die Datenbankdatei erbeutet — etwa aus einer Sicherung —
 * kann sich damit nicht anmelden.
 *
 * SHA-256 genügt hier, anders als bei Passwörtern: Ein Token mit 256 Bit Zufall
 * lässt sich nicht durchprobieren, es gibt also nichts, wogegen ein langsames
 * Verfahren schützen müsste.
 */
import { createHash, randomBytes, randomInt, timingSafeEqual } from 'node:crypto';

import {
  RECOVERY_CODE_ALPHABET,
  RECOVERY_CODE_GROUP_LENGTH,
  RECOVERY_CODE_GROUPS,
} from '@/domain/auth/recovery-code';

/** 32 Byte = 256 Bit (NFA-SEC-06). */
export const SESSION_TOKEN_BYTES = 32;

export function generateSessionToken(): string {
  return randomBytes(SESSION_TOKEN_BYTES).toString('base64url');
}

/**
 * Ein Einlösetoken für Einladung und Passwortzurücksetzung (M8).
 *
 * Dieselbe Länge und dasselbe Alphabet wie ein Sitzungstoken — es steht nur an
 * einer anderen Stelle: nicht in einem Cookie, sondern **in der Adresse**. Der
 * Link wird außerhalb der Anwendung weitergereicht, also muss er sich
 * fehlerfrei kopieren lassen; `base64url` enthält keine Zeichen, die eine URL
 * kodieren müsste.
 *
 * Eine eigene Funktion und nicht `generateSessionToken()`, obwohl der Rumpf
 * derselbe ist: Der Name sagt, was das Geheimnis ist. Wer die Länge der
 * Sitzungstoken ändert, soll nicht ungewollt die der Einladungen mitändern.
 */
export function generateRedemptionToken(): string {
  return randomBytes(SESSION_TOKEN_BYTES).toString('base64url');
}

export function hashToken(token: string): string {
  return createHash('sha256').update(token, 'utf8').digest('hex');
}

/** Zufälliger Wiederherstellungscode in seiner Rohform, ohne Gruppentrenner. */
export function generateRecoveryCodeRaw(): string {
  const length = RECOVERY_CODE_GROUPS * RECOVERY_CODE_GROUP_LENGTH;
  let code = '';
  for (let index = 0; index < length; index += 1) {
    // randomInt nutzt eine gleichverteilte Ablehnungsstichprobe — anders als
    // ein Modulo auf Zufallsbytes, das die vorderen Zeichen des Alphabets
    // bevorzugen würde.
    code += RECOVERY_CODE_ALPHABET[randomInt(RECOVERY_CODE_ALPHABET.length)];
  }
  return code;
}

export function generateCsrfToken(): string {
  return randomBytes(32).toString('base64url');
}

/**
 * Vergleicht zwei Zeichenketten in konstanter Zeit. Ein `===` würde beim ersten
 * abweichenden Zeichen abbrechen und über die Laufzeit verraten, wie viele
 * Zeichen stimmten.
 */
export function constantTimeEquals(a: string, b: string): boolean {
  const bufferA = Buffer.from(a, 'utf8');
  const bufferB = Buffer.from(b, 'utf8');
  if (bufferA.length !== bufferB.length) {
    return false;
  }
  return timingSafeEqual(bufferA, bufferB);
}
