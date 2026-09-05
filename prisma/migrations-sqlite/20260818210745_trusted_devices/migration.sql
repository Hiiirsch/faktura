-- Vertraute Geraete (M9, B2, FA-TRUST-01..05)
--
-- Reine Neuanlage: eine Tabelle, keine bestehende wird angefasst. Weder
-- CHECK-Bedingungen noch Trigger gehen verloren.
--
-- **Was der Eintrag ist.** Ein Ersatz fuer einen Faktor — deshalb so stark
-- behandelt wie ein Sitzungstoken: 256 Bit Entropie, in der Datenbank nur der
-- SHA-256-Hash, einzeln widerrufbar.
--
-- **Nur fuer Mandantenkonten** (`userId` verweist auf `User`, nicht auf
-- `AdminUser`). Betreiberkonten geben den zweiten Faktor jedes Mal ein: Wer
-- Unternehmen stilllegen kann, sichert sich jedes Mal (FA-ADM-08).

-- CreateTable
CREATE TABLE "TrustedDevice" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "userId" TEXT NOT NULL,
    "tokenHash" TEXT NOT NULL,
    "userAgent" TEXT,
    "ipAddress" TEXT,
    "expiresAt" DATETIME NOT NULL,
    "lastUsedAt" DATETIME NOT NULL,
    "createdAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT "TrustedDevice_userId_fkey" FOREIGN KEY ("userId") REFERENCES "User" ("id") ON DELETE CASCADE ON UPDATE CASCADE
);

-- CreateIndex
CREATE UNIQUE INDEX "TrustedDevice_tokenHash_key" ON "TrustedDevice"("tokenHash");

-- CreateIndex
CREATE INDEX "TrustedDevice_userId_idx" ON "TrustedDevice"("userId");

-- CreateIndex
CREATE INDEX "TrustedDevice_expiresAt_idx" ON "TrustedDevice"("expiresAt");
