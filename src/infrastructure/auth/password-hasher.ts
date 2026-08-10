/**
 * Passwort-Hashing mit Argon2id (NFA-SEC-03, Spec §11.1).
 *
 * Parameter: 64 MB Speicher, 3 Iterationen, Parallelität 1. Der Speicherbedarf
 * ist die eigentliche Verteidigung — er macht das Durchprobieren auf Grafik-
 * karten teuer. Die erzeugte Zeichenkette trägt die Parameter mit sich, sodass
 * eine spätere Erhöhung alte Hashes weiterhin prüfbar lässt.
 */
import { type Algorithm, hash, verify } from '@node-rs/argon2';

/**
 * Argon2id entspricht dem Wert 2 der Aufzählung des Pakets. Diese ist dort als
 * `const enum` deklariert, auf das unter `verbatimModuleSyntax` nicht
 * zugegriffen werden darf. Ein falscher Wert bliebe nicht unbemerkt: Der Test
 * in tests/unit/infrastructure/security.test.ts prüft, dass der erzeugte Hash
 * mit `$argon2id$` beginnt.
 */
const ARGON2ID = 2 as Algorithm;

const ARGON2_OPTIONS = {
  algorithm: ARGON2ID,
  /** In KiB — 65536 KiB entsprechen 64 MB. */
  memoryCost: 65_536,
  timeCost: 3,
  parallelism: 1,
} as const;

export async function hashPassword(password: string): Promise<string> {
  return hash(password, ARGON2_OPTIONS);
}

/**
 * Prüft ein Passwort gegen seinen Hash. Ein fehlerhaft gespeicherter Hash führt
 * zu „nicht übereinstimmend", nicht zu einer Ausnahme — sonst ließe sich am
 * Fehlerverhalten ablesen, ob ein Konto existiert.
 */
export async function verifyPassword(storedHash: string, password: string): Promise<boolean> {
  try {
    return await verify(storedHash, password);
  } catch {
    return false;
  }
}
