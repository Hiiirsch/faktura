-- Passkeys (M9, B3, FA-PASS-01..08)
--
-- Reine Neuanlage: zwei Tabellen, keine bestehende wird angefasst. Weder
-- CHECK-Bedingungen noch Trigger gehen verloren.
--
-- **Warum sich beide Identitaeten eine Tabelle teilen.** Die Zeremonie ist
-- dieselbe, ob sich ein Mandant oder der Betreiber anmeldet; getrennt bleiben
-- sie dort, wo es zaehlt — in Sitzung und Cookie. Dasselbe Muster wie
-- `PendingLogin`, mit demselben CHECK.
--
-- **Der Zaehler ist die Klonerkennung.** Ein Authenticator zaehlt jede Signatur
-- hoch; kommt ein kleinerer oder gleicher Wert zurueck als gespeichert, ist der
-- Schluessel kopiert worden. `disabledAt` ist die Folge davon: Der Passkey wird
-- gesperrt, nicht nur protokolliert — ein Wert, den man nur aufschreibt, ist
-- eine Warnung, die niemand liest.

-- CreateTable
CREATE TABLE "WebAuthnCredential" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "userId" TEXT,
    "adminUserId" TEXT,
    "credentialId" TEXT NOT NULL,
    "publicKey" TEXT NOT NULL,
    "counter" INTEGER NOT NULL DEFAULT 0,
    "transports" TEXT,
    "label" TEXT NOT NULL,
    "disabledAt" DATETIME,
    "lastUsedAt" DATETIME,
    "createdAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    -- Genau ein Konto. Ein Passkey, der zu keinem oder zu zwei Konten gehoert,
    -- waere ein Zustand, den keine Abfrage sinnvoll aufloest — dieselbe Regel
    -- wie bei `PendingLogin`.
    CONSTRAINT "WebAuthnCredential_exactly_one_account" CHECK (
        ("userId" IS NOT NULL AND "adminUserId" IS NULL)
     OR ("userId" IS NULL AND "adminUserId" IS NOT NULL)
    ),
    CONSTRAINT "WebAuthnCredential_userId_fkey" FOREIGN KEY ("userId") REFERENCES "User" ("id") ON DELETE CASCADE ON UPDATE CASCADE,
    CONSTRAINT "WebAuthnCredential_adminUserId_fkey" FOREIGN KEY ("adminUserId") REFERENCES "AdminUser" ("id") ON DELETE CASCADE ON UPDATE CASCADE
);

-- CreateTable
CREATE TABLE "WebAuthnChallenge" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "challenge" TEXT NOT NULL,
    "kind" TEXT NOT NULL,
    "userId" TEXT,
    "adminUserId" TEXT,
    "expiresAt" DATETIME NOT NULL,
    "createdAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    -- Hoechstens eines, nicht genau eines: Bei der Anmeldung mit einem
    -- auffindbaren Passkey ist zum Zeitpunkt der Aufgabe noch nicht bekannt,
    -- wer sich anmeldet — das nennt erst der Authenticator.
    CONSTRAINT "WebAuthnChallenge_at_most_one_account" CHECK (
        "userId" IS NULL OR "adminUserId" IS NULL
    ),
    CONSTRAINT "WebAuthnChallenge_known_kind" CHECK ("kind" IN ('REGISTER', 'AUTHENTICATE'))
);

-- CreateIndex
CREATE UNIQUE INDEX "WebAuthnCredential_credentialId_key" ON "WebAuthnCredential"("credentialId");

-- CreateIndex
CREATE INDEX "WebAuthnCredential_userId_idx" ON "WebAuthnCredential"("userId");

-- CreateIndex
CREATE INDEX "WebAuthnCredential_adminUserId_idx" ON "WebAuthnCredential"("adminUserId");

-- CreateIndex
CREATE INDEX "WebAuthnChallenge_expiresAt_idx" ON "WebAuthnChallenge"("expiresAt");
