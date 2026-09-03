-- Mahnwesen (M15, FA-MAHN-01 bis -07)
--
-- Zwei neue Tabellen und fuenf neue Spalten an "CompanyProfile".
--
-- **ALTER TABLE ADD COLUMN statt Tabellenneubau.** Prisma erzeugt fuer neue
-- Spalten unter SQLite gern eine RedefineTables-Migration; die haette hier alle
-- CHECK-Bedingungen und Trigger von "CompanyProfile" mitgenommen. SQLite
-- erlaubt das Hinzufuegen einer Spalte mit konstantem Vorgabewert direkt.

ALTER TABLE "CompanyProfile" ADD COLUMN "reminderFee1Cents" INTEGER NOT NULL DEFAULT 0;
ALTER TABLE "CompanyProfile" ADD COLUMN "reminderFee2Cents" INTEGER NOT NULL DEFAULT 500;
ALTER TABLE "CompanyProfile" ADD COLUMN "reminderFee3Cents" INTEGER NOT NULL DEFAULT 1000;
ALTER TABLE "CompanyProfile" ADD COLUMN "reminderPaymentTerms" INTEGER NOT NULL DEFAULT 7;
ALTER TABLE "CompanyProfile" ADD COLUMN "reminderNumberFormat" TEXT NOT NULL DEFAULT 'MA-{YYYY}-{SEQ:4}';

-- Die Mahnung.
--
-- Betraege ganzzahlig in Cent, Kalendertage als YYYY-MM-DD — wie ueberall.
-- Die CHECK-Bedingungen halten fest, was die Domaene ohnehin prueft: Eine
-- Mahnung ohne offenen Betrag gibt es nicht, eine negative Gebuehr auch nicht,
-- und es gibt genau drei Stufen.
CREATE TABLE "Reminder" (
    "id"               TEXT PRIMARY KEY NOT NULL,
    "organizationId"   TEXT NOT NULL,
    "invoiceId"        TEXT NOT NULL,
    "number"           TEXT NOT NULL,
    "level"            INTEGER NOT NULL,
    "issueDate"        TEXT NOT NULL,
    "dueDate"          TEXT NOT NULL,
    "outstandingCents" INTEGER NOT NULL,
    "feeCents"         INTEGER NOT NULL,
    "totalCents"       INTEGER NOT NULL,
    "createdById"      TEXT,
    "createdAt"        DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "Reminder_organizationId_fkey" FOREIGN KEY ("organizationId")
        REFERENCES "Organization" ("id") ON DELETE CASCADE ON UPDATE CASCADE,
    CONSTRAINT "Reminder_invoiceId_fkey" FOREIGN KEY ("invoiceId")
        REFERENCES "Invoice" ("id") ON DELETE CASCADE ON UPDATE CASCADE,
    CONSTRAINT "Reminder_createdById_fkey" FOREIGN KEY ("createdById")
        REFERENCES "User" ("id") ON DELETE SET NULL ON UPDATE CASCADE,

    CONSTRAINT "Reminder_level_range" CHECK ("level" BETWEEN 1 AND 3),
    CONSTRAINT "Reminder_outstanding_positive" CHECK ("outstandingCents" > 0),
    CONSTRAINT "Reminder_fee_not_negative" CHECK ("feeCents" >= 0),
    CONSTRAINT "Reminder_total_is_sum" CHECK ("totalCents" = "outstandingCents" + "feeCents"),
    CONSTRAINT "Reminder_dates_are_days" CHECK (
        "issueDate" GLOB '[0-9][0-9][0-9][0-9]-[0-9][0-9]-[0-9][0-9]'
        AND "dueDate" GLOB '[0-9][0-9][0-9][0-9]-[0-9][0-9]-[0-9][0-9]'
    )
);

CREATE UNIQUE INDEX "Reminder_organizationId_number_key" ON "Reminder"("organizationId", "number");
CREATE INDEX "Reminder_organizationId_createdAt_idx" ON "Reminder"("organizationId", "createdAt");
CREATE INDEX "Reminder_invoiceId_level_idx" ON "Reminder"("invoiceId", "level");

CREATE TABLE "ReminderArtifact" (
    "id"             TEXT PRIMARY KEY NOT NULL,
    "organizationId" TEXT NOT NULL,
    "reminderId"     TEXT NOT NULL,
    "kind"           TEXT NOT NULL DEFAULT 'pdf',
    "filePath"       TEXT NOT NULL,
    "sha256"         TEXT NOT NULL,
    "byteSize"       INTEGER NOT NULL,
    "fileName"       TEXT NOT NULL,
    "createdAt"      DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "ReminderArtifact_organizationId_fkey" FOREIGN KEY ("organizationId")
        REFERENCES "Organization" ("id") ON DELETE CASCADE ON UPDATE CASCADE,
    CONSTRAINT "ReminderArtifact_reminderId_fkey" FOREIGN KEY ("reminderId")
        REFERENCES "Reminder" ("id") ON DELETE CASCADE ON UPDATE CASCADE
);

CREATE UNIQUE INDEX "ReminderArtifact_reminderId_kind_key" ON "ReminderArtifact"("reminderId", "kind");
CREATE INDEX "ReminderArtifact_organizationId_createdAt_idx" ON "ReminderArtifact"("organizationId", "createdAt");

-- Eine Mahnung ist ab dem Ausstellen unveraenderlich. Anders als ein Beleg hat
-- sie keinen Entwurfszustand: Sie entsteht fertig, mit Nummer und Betraegen.
-- Es gibt deshalb keine Ausnahme fuer einzelne Spalten.
CREATE TRIGGER "Reminder_no_update"
BEFORE UPDATE ON "Reminder"
BEGIN
    SELECT RAISE(ABORT, 'Mahnungen sind unveraenderlich (FA-MAHN-05)');
END;

-- Und sie wird nicht geloescht: Eine verschickte Mahnung laesst sich nicht
-- zuruecknehmen, und die Stufe der naechsten haengt an ihr.
--
-- Unbedingt, wie "Invoice_no_delete_after_issue" fuer festgeschriebene Belege.
-- Das schliesst ein kaskadierendes Loeschen der Organisation ein — genau wie
-- dort, und aus demselben Grund: Ein Unternehmen wird stillgelegt, nicht
-- geloescht (FA-ORG-03).
CREATE TRIGGER "Reminder_no_delete"
BEFORE DELETE ON "Reminder"
BEGIN
    SELECT RAISE(ABORT, 'Mahnungen werden nicht geloescht (FA-MAHN-05)');
END;

CREATE TRIGGER "Reminder_organization_matches_insert"
BEFORE INSERT ON "Reminder"
FOR EACH ROW
WHEN NEW."organizationId" <> (SELECT "organizationId" FROM "Invoice" WHERE "id" = NEW."invoiceId")
BEGIN
    SELECT RAISE(ABORT, 'Mahnung gehoert zu einer anderen Organisation als ihr Beleg');
END;

CREATE TRIGGER "ReminderArtifact_no_update"
BEFORE UPDATE ON "ReminderArtifact"
BEGIN
    SELECT RAISE(ABORT, 'Erzeugte Mahnungsdateien sind unveraenderlich');
END;

CREATE TRIGGER "ReminderArtifact_organization_matches_insert"
BEFORE INSERT ON "ReminderArtifact"
FOR EACH ROW
WHEN NEW."organizationId" <> (SELECT "organizationId" FROM "Reminder" WHERE "id" = NEW."reminderId")
BEGIN
    SELECT RAISE(ABORT, 'Artefakt gehoert zu einer anderen Organisation als seine Mahnung');
END;

-- Die neue Berechtigung "invoice.remind" erreicht bestehende Rollen nicht von
-- selbst — ein Katalogeintrag ist keine Zuweisung.
--
-- **Sie geht ausschliesslich an Rollen, die bereits "organization.administer"
-- halten.** Das ist die Rolle "Inhaber", die die Rollenmigration angelegt hat,
-- und sie ist als "alle Berechtigungen" definiert; ohne diesen Zusatz waere sie
-- es nach dieser Migration nicht mehr, und ein Test haelt genau das fest.
--
-- Jede andere Rolle bekommt nichts. Wer eine eingeschraenkte Rolle fuehrt, hat
-- sie bewusst eingeschraenkt; eine neue Faehigkeit still hinzuzufuegen waere
-- eine Rechteerweiterung, die niemand angeordnet hat. Die Rechteverwaltung
-- traegt sie mit einem Klick nach.
INSERT INTO "RolePermission" ("id", "organizationId", "roleId", "permissionKey")
SELECT lower(hex(randomblob(16))), r."organizationId", r."id", 'invoice.remind'
FROM "Role" r
WHERE EXISTS (
    SELECT 1 FROM "RolePermission" p
    WHERE p."roleId" = r."id" AND p."permissionKey" = 'organization.administer'
)
AND NOT EXISTS (
    SELECT 1 FROM "RolePermission" p
    WHERE p."roleId" = r."id" AND p."permissionKey" = 'invoice.remind'
);
