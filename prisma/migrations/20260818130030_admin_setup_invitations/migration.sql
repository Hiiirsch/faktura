-- Einrichtungsnachweis fuer Betreiberkonten (M8, FA-ADM-06, -08)
--
-- Reine Neuanlage: eine Tabelle, keine bestehende wird angefasst. Damit gehen
-- weder CHECK-Bedingungen noch Trigger verloren.
--
-- **Was sich fachlich aendert.** Bis hierher legte `admin:create` das Konto
-- unmittelbar an und gab das TOTP-Geheimnis im Terminal aus. Das war sicher —
-- ein Betreiberkonto ohne zweiten Faktor gab es nie —, aber das Geheimnis musste
-- durch einen Scrollback und von Hand abgetippt werden.
--
-- Jetzt entsteht zuerst nur dieser Nachweis; Passwort und zweiter Faktor werden
-- im Browser gesetzt, der QR-Code kommt aus dem eigenen Prozess. Der `AdminUser`
-- entsteht beim Einloesen, vollstaendig, in einer Transaktion. Die Zusage
-- „kein Betreiberkonto ohne zweiten Faktor" bleibt damit erhalten.

-- CreateTable
CREATE TABLE "AdminInvitation" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "email" TEXT NOT NULL,
    "tokenHash" TEXT NOT NULL,
    "totpSecret" TEXT NOT NULL,
    "expiresAt" DATETIME NOT NULL,
    "acceptedAt" DATETIME,
    "revokedAt" DATETIME,
    "createdAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP
);

-- CreateIndex
CREATE UNIQUE INDEX "AdminInvitation_tokenHash_key" ON "AdminInvitation"("tokenHash");

-- CreateIndex
CREATE INDEX "AdminInvitation_email_idx" ON "AdminInvitation"("email");

-- CreateIndex
CREATE INDEX "AdminInvitation_expiresAt_idx" ON "AdminInvitation"("expiresAt");

-- ─── Ein offener Nachweis je Adresse ────────────────────────────────────────
--
-- Dieselbe Bauart wie `Invitation_one_open_per_email` (FA-MEMB-07) und aus
-- demselben Grund: Zwei offene Nachweise fuer dieselbe Adresse waeren zwei Wege
-- zu einem Konto, und der zweite scheiterte erst beim Einloesen — mit einem Link
-- in fremder Hand, der nie funktioniert.
--
-- Partiell, weil ein eingeloester oder zurueckgezogener Nachweis stehen bleibt:
-- Er ist die Spur, dass das Konto ueber diesen Weg entstanden ist.
--
-- Der Index kennt die Frist **nicht** — ein Index-`WHERE` darf in SQLite kein
-- `CURRENT_TIMESTAMP` nennen. Ein abgelaufener Nachweis gilt hier also weiter
-- als offen; `createAdminInvitation` zieht deshalb vorhandene ausdruecklich
-- zurueck, bevor sie einen neuen ausstellt.
CREATE UNIQUE INDEX "AdminInvitation_one_open_per_email"
ON "AdminInvitation"("email")
WHERE "acceptedAt" IS NULL AND "revokedAt" IS NULL;
