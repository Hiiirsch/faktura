-- Einladungen und Passwortzurücksetzungen (M8, B4)
--
-- FA-MEMB-01..07: Ein Konto entsteht ausschliesslich per Einladung, die Frist
-- betraegt sieben Tage, sie ist einmal einloesbar, und das Passwort setzt der
-- Eingeladene selbst.
--
-- **Reine Neuanlage.** Beide Tabellen kommen hinzu, keine bestehende wird neu
-- aufgebaut: Die Rueckbeziehungen an `Organization`, `User` und `Role` sind in
-- Prisma virtuell und erzeugen keine Spalte. Damit gehen weder CHECK-Bedingungen
-- noch Trigger verloren — `tests/integration/database-triggers.test.ts` haelt das
-- fest.
--
-- Handgeschrieben ergaenzt sind drei Dinge, die Prisma nicht aus dem Schema
-- erzeugen kann:
--
-- 1. Zwei CHECK-Bedingungen an `Invitation`. Sie stehen in der CREATE TABLE,
--    weil SQLite kein `ALTER TABLE ADD CONSTRAINT` kennt.
-- 2. Der **partielle** eindeutige Index `Invitation_one_open_per_email`
--    (FA-MEMB-07). Partielle Indizes kennt Prisma nicht.
-- 3. Zwei Trigger fuer die Mandantengrenze: Die Rolle einer Einladung gehoert
--    demselben Unternehmen. Ohne sie liesse sich ueber das Einladungsformular
--    eine fremde Rolle zuweisen.

-- CreateTable
CREATE TABLE "Invitation" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "organizationId" TEXT NOT NULL,
    "email" TEXT NOT NULL,
    "roleId" TEXT NOT NULL,
    "tokenHash" TEXT NOT NULL,
    "invitedById" TEXT,
    "expiresAt" DATETIME NOT NULL,
    "acceptedAt" DATETIME,
    "revokedAt" DATETIME,
    "createdAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    -- Eine Einladung ohne Adresse gilt fuer niemanden.
    CONSTRAINT "Invitation_email_not_empty" CHECK (length(trim("email")) > 0),
    -- Angenommen **und** zurueckgezogen ist kein Zustand, sondern ein Fehler in
    -- der Anwendung. Beide Felder werden nur einmal gesetzt.
    CONSTRAINT "Invitation_accepted_xor_revoked" CHECK ("acceptedAt" IS NULL OR "revokedAt" IS NULL),
    CONSTRAINT "Invitation_organizationId_fkey" FOREIGN KEY ("organizationId") REFERENCES "Organization" ("id") ON DELETE CASCADE ON UPDATE CASCADE,
    CONSTRAINT "Invitation_roleId_fkey" FOREIGN KEY ("roleId") REFERENCES "Role" ("id") ON DELETE RESTRICT ON UPDATE CASCADE,
    CONSTRAINT "Invitation_invitedById_fkey" FOREIGN KEY ("invitedById") REFERENCES "User" ("id") ON DELETE SET NULL ON UPDATE CASCADE
);

-- CreateTable
CREATE TABLE "PasswordReset" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "userId" TEXT NOT NULL,
    "tokenHash" TEXT NOT NULL,
    "expiresAt" DATETIME NOT NULL,
    "usedAt" DATETIME,
    "createdAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT "PasswordReset_userId_fkey" FOREIGN KEY ("userId") REFERENCES "User" ("id") ON DELETE CASCADE ON UPDATE CASCADE
);

-- CreateIndex
CREATE UNIQUE INDEX "Invitation_tokenHash_key" ON "Invitation"("tokenHash");

-- CreateIndex
CREATE INDEX "Invitation_organizationId_idx" ON "Invitation"("organizationId");

-- CreateIndex
CREATE INDEX "Invitation_roleId_idx" ON "Invitation"("roleId");

-- CreateIndex
CREATE INDEX "Invitation_email_idx" ON "Invitation"("email");

-- CreateIndex
CREATE INDEX "Invitation_expiresAt_idx" ON "Invitation"("expiresAt");

-- CreateIndex
CREATE UNIQUE INDEX "PasswordReset_tokenHash_key" ON "PasswordReset"("tokenHash");

-- CreateIndex
CREATE INDEX "PasswordReset_userId_idx" ON "PasswordReset"("userId");

-- CreateIndex
CREATE INDEX "PasswordReset_expiresAt_idx" ON "PasswordReset"("expiresAt");

-- ─── Eine offene Einladung je Adresse (FA-MEMB-07) ──────────────────────────
--
-- Partiell und **global**, nicht je Unternehmen: Eine Adresse gehoert zu genau
-- einem Unternehmen (`User.email` ist global eindeutig). Zwei offene Einladungen
-- fuer dieselbe Adresse waeren zwei Wege in zwei Unternehmen, und der zweite
-- scheiterte erst beim Annehmen — mit einem Link in fremder Hand, der nie
-- funktioniert.
--
-- Der Index kennt die **Frist nicht**: Ein Index-`WHERE` darf in SQLite nicht
-- `CURRENT_TIMESTAMP` nennen, weil der Ausdruck deterministisch sein muss. Eine
-- abgelaufene Einladung gilt hier also weiter als offen. Deshalb zieht
-- `inviteMember` eine vorhandene offene Einladung ausdruecklich zurueck, bevor
-- sie eine neue ausstellt — was ohnehin die gewuenschte Bedeutung ist: Wer
-- erneut einlaedt, entwertet den alten Link.
CREATE UNIQUE INDEX "Invitation_one_open_per_email"
ON "Invitation"("email")
WHERE "acceptedAt" IS NULL AND "revokedAt" IS NULL;

-- ─── Mandantengrenze der Einladung ─────────────────────────────────────────
--
-- Dieselbe Bauart wie `User_role_matches_organization_*` aus
-- `roles_and_permissions`: Die Rolle, die eine Einladung mitbringt, gehoert dem
-- Unternehmen der Einladung. Ohne diese Trigger genuegte eine fremde Rollen-ID
-- im Formular, um ein Konto mit Rechten in einem anderen Unternehmen anzulegen.
CREATE TRIGGER "Invitation_role_matches_organization_insert"
AFTER INSERT ON "Invitation"
FOR EACH ROW
WHEN (SELECT "organizationId" FROM "Role" WHERE "id" = NEW."roleId") <> NEW."organizationId"
BEGIN
    SELECT RAISE(ABORT, 'Rolle gehört zu einer anderen Organisation');
END;

CREATE TRIGGER "Invitation_role_matches_organization_update"
AFTER UPDATE OF "roleId", "organizationId" ON "Invitation"
FOR EACH ROW
WHEN (SELECT "organizationId" FROM "Role" WHERE "id" = NEW."roleId") <> NEW."organizationId"
BEGIN
    SELECT RAISE(ABORT, 'Rolle gehört zu einer anderen Organisation');
END;
