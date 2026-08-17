-- Rollen je Unternehmen (M8, FA-ROLE-01 bis -06).
--
-- ACHTUNG — der Fall, fuer den tests/integration/database-triggers.test.ts
-- gebaut wurde, tritt hier ein: Prisma baut `AuditLog` neu auf, weil die Spalte
-- `actorKind` hinzukommt. `DROP TABLE "AuditLog"` entfernt dabei **beide**
-- Trigger, die die Unveraenderlichkeit des Protokolls sichern
-- (NFA-COMP-02) — ohne dass im Diff der schema.prisma etwas darauf hindeutet.
-- Sie werden am Ende dieser Migration neu angelegt.
--
-- `User` wird ebenfalls neu aufgebaut (neue Spalte `roleId` mit Fremdschluessel).
-- Auf `User` liegen keine Trigger, und kein Trigger liest `User` — geprueft.

-- AlterTable
ALTER TABLE "Organization" ADD COLUMN "suspendedAt" DATETIME;

-- CreateTable
CREATE TABLE "Role" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "organizationId" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "description" TEXT,
    "createdAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" DATETIME NOT NULL,
    CONSTRAINT "Role_organizationId_fkey" FOREIGN KEY ("organizationId") REFERENCES "Organization" ("id") ON DELETE CASCADE ON UPDATE CASCADE
);

-- CreateTable
CREATE TABLE "RolePermission" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "organizationId" TEXT NOT NULL,
    "roleId" TEXT NOT NULL,
    "permissionKey" TEXT NOT NULL,
    CONSTRAINT "RolePermission_roleId_fkey" FOREIGN KEY ("roleId") REFERENCES "Role" ("id") ON DELETE CASCADE ON UPDATE CASCADE
);

-- RedefineTables
PRAGMA defer_foreign_keys=ON;
PRAGMA foreign_keys=OFF;
CREATE TABLE "new_AuditLog" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "organizationId" TEXT NOT NULL,
    "entityType" TEXT NOT NULL,
    "entityId" TEXT NOT NULL,
    "action" TEXT NOT NULL,
    "actorId" TEXT,
    "actorKind" TEXT NOT NULL DEFAULT 'USER',
    "diffJson" TEXT,
    "ipAddress" TEXT,
    "createdAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT "AuditLog_organizationId_fkey" FOREIGN KEY ("organizationId") REFERENCES "Organization" ("id") ON DELETE CASCADE ON UPDATE CASCADE
);
INSERT INTO "new_AuditLog" ("action", "actorId", "createdAt", "diffJson", "entityId", "entityType", "id", "ipAddress", "organizationId") SELECT "action", "actorId", "createdAt", "diffJson", "entityId", "entityType", "id", "ipAddress", "organizationId" FROM "AuditLog";
DROP TABLE "AuditLog";
ALTER TABLE "new_AuditLog" RENAME TO "AuditLog";
CREATE INDEX "AuditLog_organizationId_entityType_entityId_idx" ON "AuditLog"("organizationId", "entityType", "entityId");
CREATE INDEX "AuditLog_organizationId_createdAt_idx" ON "AuditLog"("organizationId", "createdAt");
CREATE TABLE "new_User" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "organizationId" TEXT NOT NULL,
    "email" TEXT NOT NULL,
    "passwordHash" TEXT NOT NULL,
    "totpSecret" TEXT,
    "totpEnabled" BOOLEAN NOT NULL DEFAULT false,
    "failedLogins" INTEGER NOT NULL DEFAULT 0,
    "lockedUntil" DATETIME,
    "name" TEXT,
    "disabledAt" DATETIME,
    "lastLoginAt" DATETIME,
    "roleId" TEXT,
    "createdAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" DATETIME NOT NULL,
    CONSTRAINT "User_organizationId_fkey" FOREIGN KEY ("organizationId") REFERENCES "Organization" ("id") ON DELETE CASCADE ON UPDATE CASCADE,
    CONSTRAINT "User_roleId_fkey" FOREIGN KEY ("roleId") REFERENCES "Role" ("id") ON DELETE RESTRICT ON UPDATE CASCADE
);
INSERT INTO "new_User" ("createdAt", "email", "failedLogins", "id", "lockedUntil", "organizationId", "passwordHash", "totpEnabled", "totpSecret", "updatedAt") SELECT "createdAt", "email", "failedLogins", "id", "lockedUntil", "organizationId", "passwordHash", "totpEnabled", "totpSecret", "updatedAt" FROM "User";
DROP TABLE "User";
ALTER TABLE "new_User" RENAME TO "User";
CREATE UNIQUE INDEX "User_email_key" ON "User"("email");
CREATE INDEX "User_organizationId_idx" ON "User"("organizationId");
CREATE INDEX "User_roleId_idx" ON "User"("roleId");
PRAGMA foreign_keys=ON;
PRAGMA defer_foreign_keys=OFF;

-- CreateIndex
CREATE INDEX "Role_organizationId_idx" ON "Role"("organizationId");

-- CreateIndex
CREATE UNIQUE INDEX "Role_organizationId_name_key" ON "Role"("organizationId", "name");

-- CreateIndex
CREATE INDEX "RolePermission_organizationId_idx" ON "RolePermission"("organizationId");

-- CreateIndex
CREATE UNIQUE INDEX "RolePermission_roleId_permissionKey_key" ON "RolePermission"("roleId", "permissionKey");

-- ─── Unveraenderlichkeit des Protokolls wiederherstellen (NFA-COMP-02) ──────
--
-- Woertlich wie in 20260811113615_organization_context. Ohne diese beiden Zeilen
-- waere das Audit-Log nach dieser Migration aenderbar und loeschbar, und nichts
-- ausser dem Triggertest wuerde es melden.

CREATE TRIGGER "AuditLog_no_update"
BEFORE UPDATE ON "AuditLog"
BEGIN
    SELECT RAISE(ABORT, 'AuditLog ist unveraenderlich (NFA-COMP-02)');
END;

CREATE TRIGGER "AuditLog_no_delete"
BEFORE DELETE ON "AuditLog"
BEGIN
    SELECT RAISE(ABORT, 'AuditLog ist unveraenderlich (NFA-COMP-02)');
END;

-- ─── Bestand: Rolle „Inhaber" je Unternehmen ───────────────────────────────
--
-- Die laufende Installation hat Konten ohne Rolle. Sie bekommen eine Rolle mit
-- **allen** Berechtigungen: Vor dieser Migration durfte jedes Konto alles, und
-- eine Umstellung darf niemandem etwas wegnehmen.
--
-- Deterministische Kennungen statt cuid — SQL kann keine erzeugen. Die
-- Schluesselliste steht woertlich hier und ist eine Momentaufnahme des Katalogs
-- zum Umstellungszeitpunkt; sie soll das auch bleiben. Der Katalog selbst lebt
-- in src/domain/policy/can.ts.

INSERT INTO "Role" ("id", "organizationId", "name", "description", "createdAt", "updatedAt")
SELECT 'role_owner_' || o."id",
       o."id",
       'Inhaber',
       'Bei der Umstellung auf Rollen angelegt — alle Berechtigungen.',
       CURRENT_TIMESTAMP,
       CURRENT_TIMESTAMP
FROM "Organization" o;

INSERT INTO "RolePermission" ("id", "organizationId", "roleId", "permissionKey")
SELECT lower(hex(randomblob(16))), r."organizationId", r."id", k."key"
FROM "Role" r
CROSS JOIN (
    SELECT 'invoice.create' AS key
    UNION ALL SELECT 'invoice.read'
    UNION ALL SELECT 'invoice.update'
    UNION ALL SELECT 'invoice.delete'
    UNION ALL SELECT 'invoice.duplicate'
    UNION ALL SELECT 'invoice.issue'
    UNION ALL SELECT 'invoice.cancel'
    UNION ALL SELECT 'invoice.recordPayment'
    UNION ALL SELECT 'customer.create'
    UNION ALL SELECT 'customer.read'
    UNION ALL SELECT 'customer.update'
    UNION ALL SELECT 'customer.archive'
    UNION ALL SELECT 'catalogItem.create'
    UNION ALL SELECT 'catalogItem.read'
    UNION ALL SELECT 'catalogItem.update'
    UNION ALL SELECT 'catalogItem.archive'
    UNION ALL SELECT 'companyProfile.read'
    UNION ALL SELECT 'companyProfile.update'
    UNION ALL SELECT 'numbering.read'
    UNION ALL SELECT 'numbering.update'
    UNION ALL SELECT 'security.read'
    UNION ALL SELECT 'security.update'
    UNION ALL SELECT 'template.create'
    UNION ALL SELECT 'template.read'
    UNION ALL SELECT 'template.update'
    UNION ALL SELECT 'template.delete'
    UNION ALL SELECT 'export.run'
    UNION ALL SELECT 'organization.administer'
) k
WHERE r."name" = 'Inhaber';

UPDATE "User" SET "roleId" = 'role_owner_' || "organizationId" WHERE "roleId" IS NULL;

-- ─── Mandantengrenze der neuen Tabellen ────────────────────────────────────
--
-- Dasselbe Muster wie bei InvoiceLine und Payment: Ein Verweis darf die
-- Organisationsgrenze nicht ueberschreiten. Ohne diese Trigger koennte ein Konto
-- eine Rolle eines fremden Unternehmens tragen.

CREATE TRIGGER "RolePermission_organization_matches_insert"
BEFORE INSERT ON "RolePermission"
FOR EACH ROW
WHEN NEW."organizationId" <> (SELECT "organizationId" FROM "Role" WHERE "id" = NEW."roleId")
BEGIN
    SELECT RAISE(ABORT, 'Berechtigung gehoert zu einer anderen Organisation als ihre Rolle');
END;

CREATE TRIGGER "RolePermission_organization_matches_update"
BEFORE UPDATE ON "RolePermission"
FOR EACH ROW
WHEN NEW."organizationId" <> (SELECT "organizationId" FROM "Role" WHERE "id" = NEW."roleId")
BEGIN
    SELECT RAISE(ABORT, 'Berechtigung gehoert zu einer anderen Organisation als ihre Rolle');
END;

CREATE TRIGGER "User_role_matches_organization_insert"
BEFORE INSERT ON "User"
FOR EACH ROW
WHEN NEW."roleId" IS NOT NULL
 AND NEW."organizationId" <> (SELECT "organizationId" FROM "Role" WHERE "id" = NEW."roleId")
BEGIN
    SELECT RAISE(ABORT, 'Konto verweist auf eine Rolle einer anderen Organisation');
END;

CREATE TRIGGER "User_role_matches_organization_update"
BEFORE UPDATE ON "User"
FOR EACH ROW
WHEN NEW."roleId" IS NOT NULL
 AND NEW."organizationId" <> (SELECT "organizationId" FROM "Role" WHERE "id" = NEW."roleId")
BEGIN
    SELECT RAISE(ABORT, 'Konto verweist auf eine Rolle einer anderen Organisation');
END;

-- ─── Aussperrsicherung (FA-ROLE-04) ────────────────────────────────────────
--
-- Je Organisation haelt zu jedem Zeitpunkt mindestens ein nicht gesperrtes Konto
-- die Berechtigung `organization.administer`. Sonst koennte sich ein Unternehmen
-- selbst die Rechteverwaltung entziehen und waere ausgesperrt — ohne dass der
-- Betreiber es ohne Datenbankzugriff heilen koennte.
--
-- Die Anwendung erklaert (`LAST_ADMINISTRATOR`), die Datenbank garantiert.
--
-- ZWEI Einschraenkungen, die beide durch Fehlschlaege gelernt wurden:
--
-- 1. `AFTER UPDATE OF …` statt `AFTER UPDATE`. Der erste Entwurf feuerte bei
--    **jeder** Aenderung an einem Konto — auch beim Zuruecksetzen des
--    Fehlversuchszaehlers nach einer erfolgreichen Anmeldung. Damit war in einer
--    Organisation ohne Rechteverwaltung keine Anmeldung mehr moeglich.
--
-- 2. Der Trigger greift nur, wenn die Aenderung den verbotenen Zustand
--    **herstellt** — nicht, wenn er schon vorher bestand. Geprueft wird deshalb
--    zusaetzlich, ob die betroffene Zeile selbst eine aktive Rechteverwaltung
--    war. Ohne diese Bedingung liesse sich in einer Organisation ohne
--    Rechteverwaltung ueberhaupt kein Konto mehr sperren, obwohl das die Lage
--    nicht verschlechtert.
--
-- Kein Trigger auf INSERT: Beim ersten Konto einer neuen Organisation gibt es
-- noch keine Rechteverwaltung, und ein Wachposten dort machte das Anlegen
-- unmoeglich. Die Anwendung legt Organisation, Rolle und erstes Konto in einer
-- Transaktion an (FA-ORG-02).
--
-- Kein Trigger auf `Role` DELETE: `User.roleId` traegt `ON DELETE RESTRICT`, eine
-- benutzte Rolle laesst sich also nicht loeschen. Eine Rolle, die niemand
-- traegt, kann niemandem ein Recht nehmen.
--
-- WICHTIG fuer die Anwendung: Trigger sind zeilenweise, und SQLite kennt keine
-- aufgeschobenen Bedingungen. Wer eine Rolle umbaut, muss **erst gewaehren, dann
-- entziehen**.

CREATE TRIGGER "Organization_keeps_administrator_on_user_update"
AFTER UPDATE OF "roleId", "disabledAt", "organizationId" ON "User"
FOR EACH ROW
WHEN OLD."disabledAt" IS NULL
 AND EXISTS (SELECT 1 FROM "RolePermission"
             WHERE "roleId" = OLD."roleId"
               AND "permissionKey" = 'organization.administer')
 AND (SELECT COUNT(*) FROM "User" u
      JOIN "RolePermission" rp ON rp."roleId" = u."roleId"
      WHERE u."organizationId" = OLD."organizationId"
        AND u."disabledAt" IS NULL
        AND rp."permissionKey" = 'organization.administer') = 0
BEGIN
    SELECT RAISE(ABORT, 'Letztes Konto mit Rechteverwaltung (FA-ROLE-04)');
END;

CREATE TRIGGER "Organization_keeps_administrator_on_user_delete"
AFTER DELETE ON "User"
FOR EACH ROW
WHEN OLD."disabledAt" IS NULL
 AND EXISTS (SELECT 1 FROM "RolePermission"
             WHERE "roleId" = OLD."roleId"
               AND "permissionKey" = 'organization.administer')
 AND (SELECT COUNT(*) FROM "User" u
      JOIN "RolePermission" rp ON rp."roleId" = u."roleId"
      WHERE u."organizationId" = OLD."organizationId"
        AND u."disabledAt" IS NULL
        AND rp."permissionKey" = 'organization.administer') = 0
 AND EXISTS (SELECT 1 FROM "Organization" WHERE "id" = OLD."organizationId")
BEGIN
    SELECT RAISE(ABORT, 'Letztes Konto mit Rechteverwaltung (FA-ROLE-04)');
END;

CREATE TRIGGER "Organization_keeps_administrator_on_permission_delete"
AFTER DELETE ON "RolePermission"
FOR EACH ROW
WHEN OLD."permissionKey" = 'organization.administer'
 AND (SELECT COUNT(*) FROM "User" u
      JOIN "RolePermission" rp ON rp."roleId" = u."roleId"
      WHERE u."organizationId" = OLD."organizationId"
        AND u."disabledAt" IS NULL
        AND rp."permissionKey" = 'organization.administer') = 0
 AND EXISTS (SELECT 1 FROM "User"
             WHERE "roleId" = OLD."roleId" AND "disabledAt" IS NULL)
 AND EXISTS (SELECT 1 FROM "Organization" WHERE "id" = OLD."organizationId")
BEGIN
    SELECT RAISE(ABORT, 'Letztes Konto mit Rechteverwaltung (FA-ROLE-04)');
END;
