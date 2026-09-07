-- M5.5a: Mandantenkontext (organizationId) auf allen kaufmaennisch gebundenen
-- Tabellen.
--
-- Bestandsdaten bleiben erhalten: Die Migration legt genau eine Organisation an
-- und haengt jede vorhandene Zeile daran. Der Name wird aus dem Firmenprofil
-- uebernommen, falls eines existiert.
--
-- Zwei Punkte, die bei SQLite Aufmerksamkeit brauchen:
--
-- 1. Jede Tabelle mit neuer Spalte wird neu aufgebaut (SQLite kennt kein
--    ALTER TABLE ADD CONSTRAINT). Dabei gehen **alle** handgeschriebenen
--    Trigger verloren. Die Unveraenderlichkeits-Trigger aus
--    20260810230000 und 20260810234500 werden deshalb am Ende neu angelegt.
-- 2. Die CHECK-Bedingung "id" = 1 auf CompanyProfile entfaellt ersatzlos. Der
--    Singleton ist jetzt mandantenbezogen und wird durch den eindeutigen Index
--    auf organizationId erzwungen — die schaerfere Zusage, weil sie auch bei
--    mehreren Organisationen gilt.

-- CreateTable
CREATE TABLE "Organization" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "name" TEXT NOT NULL,
    "createdAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP
);

-- Die eine Organisation, an der alle Bestandsdaten haengen. Feste Kennung,
-- damit Betriebsskripte und Wiederherstellungen sie ohne Abfrage benennen
-- koennen.
INSERT INTO "Organization" ("id", "name")
VALUES (
    'org_default',
    COALESCE((SELECT "legalName" FROM "CompanyProfile" LIMIT 1), 'Meine Organisation')
);

-- Trigger vor dem Neuaufbau abraeumen.
--
-- Nicht bloss Aufraeumarbeit: InvoiceLine_immutable_after_issue liest die
-- Tabelle Invoice. SQLite parst beim Umbenennen einer Tabelle das gesamte
-- Schema neu und bricht ab, solange ein Trigger auf eine gerade nicht
-- existierende Tabelle zeigt. Am Ende dieser Migration werden sie wieder
-- angelegt.
DROP TRIGGER IF EXISTS "AuditLog_no_update";
DROP TRIGGER IF EXISTS "AuditLog_no_delete";
DROP TRIGGER IF EXISTS "Invoice_immutable_after_issue";
DROP TRIGGER IF EXISTS "Invoice_no_delete_after_issue";
DROP TRIGGER IF EXISTS "InvoiceLine_immutable_after_issue";
DROP TRIGGER IF EXISTS "InvoiceLine_no_delete_after_issue";

-- RedefineTables
PRAGMA defer_foreign_keys=ON;
PRAGMA foreign_keys=OFF;
CREATE TABLE "new_Asset" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "organizationId" TEXT NOT NULL,
    "fileName" TEXT NOT NULL,
    "mimeType" TEXT NOT NULL,
    "byteSize" INTEGER NOT NULL,
    "sha256" TEXT NOT NULL,
    "storagePath" TEXT NOT NULL,
    "createdAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT "Asset_organizationId_fkey" FOREIGN KEY ("organizationId") REFERENCES "Organization" ("id") ON DELETE CASCADE ON UPDATE CASCADE
);
INSERT INTO "new_Asset" ("organizationId", "byteSize", "createdAt", "fileName", "id", "mimeType", "sha256", "storagePath") SELECT 'org_default', "byteSize", "createdAt", "fileName", "id", "mimeType", "sha256", "storagePath" FROM "Asset";
DROP TABLE "Asset";
ALTER TABLE "new_Asset" RENAME TO "Asset";
CREATE INDEX "Asset_organizationId_idx" ON "Asset"("organizationId");
CREATE TABLE "new_AuditLog" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "organizationId" TEXT NOT NULL,
    "entityType" TEXT NOT NULL,
    "entityId" TEXT NOT NULL,
    "action" TEXT NOT NULL,
    "actorId" TEXT,
    "diffJson" TEXT,
    "ipAddress" TEXT,
    "createdAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT "AuditLog_organizationId_fkey" FOREIGN KEY ("organizationId") REFERENCES "Organization" ("id") ON DELETE CASCADE ON UPDATE CASCADE
);
INSERT INTO "new_AuditLog" ("organizationId", "action", "actorId", "createdAt", "diffJson", "entityId", "entityType", "id", "ipAddress") SELECT 'org_default', "action", "actorId", "createdAt", "diffJson", "entityId", "entityType", "id", "ipAddress" FROM "AuditLog";
DROP TABLE "AuditLog";
ALTER TABLE "new_AuditLog" RENAME TO "AuditLog";
CREATE INDEX "AuditLog_organizationId_entityType_entityId_idx" ON "AuditLog"("organizationId", "entityType", "entityId");
CREATE INDEX "AuditLog_organizationId_createdAt_idx" ON "AuditLog"("organizationId", "createdAt");
CREATE TABLE "new_CatalogItem" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "organizationId" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "description" TEXT,
    "unitPriceCents" INTEGER NOT NULL,
    "unitCode" TEXT NOT NULL DEFAULT 'C62',
    "taxRateBasisPoints" INTEGER NOT NULL DEFAULT 1900,
    "isArchived" BOOLEAN NOT NULL DEFAULT false,
    "createdAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" DATETIME NOT NULL,
    CONSTRAINT "CatalogItem_organizationId_fkey" FOREIGN KEY ("organizationId") REFERENCES "Organization" ("id") ON DELETE CASCADE ON UPDATE CASCADE
);
INSERT INTO "new_CatalogItem" ("organizationId", "createdAt", "description", "id", "isArchived", "name", "taxRateBasisPoints", "unitCode", "unitPriceCents", "updatedAt") SELECT 'org_default', "createdAt", "description", "id", "isArchived", "name", "taxRateBasisPoints", "unitCode", "unitPriceCents", "updatedAt" FROM "CatalogItem";
DROP TABLE "CatalogItem";
ALTER TABLE "new_CatalogItem" RENAME TO "CatalogItem";
CREATE INDEX "CatalogItem_organizationId_isArchived_idx" ON "CatalogItem"("organizationId", "isArchived");
CREATE TABLE "new_CompanyProfile" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "organizationId" TEXT NOT NULL,
    "legalName" TEXT NOT NULL,
    "addressLine1" TEXT NOT NULL,
    "addressLine2" TEXT,
    "postalCode" TEXT NOT NULL,
    "city" TEXT NOT NULL,
    "countryCode" TEXT NOT NULL DEFAULT 'DE',
    "email" TEXT,
    "phone" TEXT,
    "website" TEXT,
    "taxNumber" TEXT,
    "vatId" TEXT,
    "isSmallBusiness" BOOLEAN NOT NULL DEFAULT false,
    "registerCourt" TEXT,
    "registerNumber" TEXT,
    "managingDirector" TEXT,
    "bankAccountHolder" TEXT,
    "iban" TEXT,
    "bic" TEXT,
    "bankName" TEXT,
    "logoAssetId" TEXT,
    "defaultPaymentTerms" INTEGER NOT NULL DEFAULT 14,
    "defaultTaxRateBasisPoints" INTEGER NOT NULL DEFAULT 1900,
    "defaultCurrency" TEXT NOT NULL DEFAULT 'EUR',
    "footerText" TEXT,
    "invoiceNumberFormat" TEXT NOT NULL DEFAULT 'RE-{YYYY}-{SEQ:4}',
    "updatedAt" DATETIME NOT NULL,
    CONSTRAINT "CompanyProfile_organizationId_fkey" FOREIGN KEY ("organizationId") REFERENCES "Organization" ("id") ON DELETE CASCADE ON UPDATE CASCADE,
    CONSTRAINT "CompanyProfile_logoAssetId_fkey" FOREIGN KEY ("logoAssetId") REFERENCES "Asset" ("id") ON DELETE SET NULL ON UPDATE CASCADE
);
INSERT INTO "new_CompanyProfile" ("organizationId", "addressLine1", "addressLine2", "bankAccountHolder", "bankName", "bic", "city", "countryCode", "defaultCurrency", "defaultPaymentTerms", "defaultTaxRateBasisPoints", "email", "footerText", "iban", "id", "invoiceNumberFormat", "isSmallBusiness", "legalName", "logoAssetId", "managingDirector", "phone", "postalCode", "registerCourt", "registerNumber", "taxNumber", "updatedAt", "vatId", "website") SELECT 'org_default', "addressLine1", "addressLine2", "bankAccountHolder", "bankName", "bic", "city", "countryCode", "defaultCurrency", "defaultPaymentTerms", "defaultTaxRateBasisPoints", "email", "footerText", "iban", "id", "invoiceNumberFormat", "isSmallBusiness", "legalName", "logoAssetId", "managingDirector", "phone", "postalCode", "registerCourt", "registerNumber", "taxNumber", "updatedAt", "vatId", "website" FROM "CompanyProfile";
DROP TABLE "CompanyProfile";
ALTER TABLE "new_CompanyProfile" RENAME TO "CompanyProfile";
CREATE UNIQUE INDEX "CompanyProfile_organizationId_key" ON "CompanyProfile"("organizationId");
CREATE TABLE "new_Customer" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "organizationId" TEXT NOT NULL,
    "customerNumber" TEXT NOT NULL,
    "companyName" TEXT,
    "contactName" TEXT,
    "addressLine1" TEXT NOT NULL,
    "addressLine2" TEXT,
    "postalCode" TEXT NOT NULL,
    "city" TEXT NOT NULL,
    "countryCode" TEXT NOT NULL DEFAULT 'DE',
    "email" TEXT,
    "phone" TEXT,
    "vatId" TEXT,
    "buyerReference" TEXT,
    "paymentTerms" INTEGER,
    "notes" TEXT,
    "isArchived" BOOLEAN NOT NULL DEFAULT false,
    "createdAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" DATETIME NOT NULL,
    CONSTRAINT "Customer_organizationId_fkey" FOREIGN KEY ("organizationId") REFERENCES "Organization" ("id") ON DELETE CASCADE ON UPDATE CASCADE
);
INSERT INTO "new_Customer" ("organizationId", "addressLine1", "addressLine2", "buyerReference", "city", "companyName", "contactName", "countryCode", "createdAt", "customerNumber", "email", "id", "isArchived", "notes", "paymentTerms", "phone", "postalCode", "updatedAt", "vatId") SELECT 'org_default', "addressLine1", "addressLine2", "buyerReference", "city", "companyName", "contactName", "countryCode", "createdAt", "customerNumber", "email", "id", "isArchived", "notes", "paymentTerms", "phone", "postalCode", "updatedAt", "vatId" FROM "Customer";
DROP TABLE "Customer";
ALTER TABLE "new_Customer" RENAME TO "Customer";
CREATE INDEX "Customer_organizationId_isArchived_idx" ON "Customer"("organizationId", "isArchived");
CREATE UNIQUE INDEX "Customer_organizationId_customerNumber_key" ON "Customer"("organizationId", "customerNumber");
CREATE TABLE "new_Invoice" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "organizationId" TEXT NOT NULL,
    "documentType" TEXT NOT NULL DEFAULT 'INVOICE',
    "invoiceNumber" TEXT,
    "status" TEXT NOT NULL DEFAULT 'DRAFT',
    "customerId" TEXT NOT NULL,
    "snapshotBuyer" TEXT,
    "snapshotSeller" TEXT,
    "issueDate" TEXT,
    "serviceDateFrom" TEXT,
    "serviceDateTo" TEXT,
    "dueDate" TEXT,
    "currency" TEXT NOT NULL DEFAULT 'EUR',
    "taxScheme" TEXT NOT NULL DEFAULT 'STANDARD',
    "introText" TEXT,
    "outroText" TEXT,
    "purchaseOrderRef" TEXT,
    "precedingInvoiceId" TEXT,
    "templateId" TEXT,
    "netTotalCents" INTEGER NOT NULL DEFAULT 0,
    "taxTotalCents" INTEGER NOT NULL DEFAULT 0,
    "grossTotalCents" INTEGER NOT NULL DEFAULT 0,
    "paidTotalCents" INTEGER NOT NULL DEFAULT 0,
    "issuedAt" DATETIME,
    "cancelledAt" DATETIME,
    "createdAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" DATETIME NOT NULL,
    CONSTRAINT "Invoice_organizationId_fkey" FOREIGN KEY ("organizationId") REFERENCES "Organization" ("id") ON DELETE CASCADE ON UPDATE CASCADE,
    CONSTRAINT "Invoice_customerId_fkey" FOREIGN KEY ("customerId") REFERENCES "Customer" ("id") ON DELETE RESTRICT ON UPDATE CASCADE,
    CONSTRAINT "Invoice_precedingInvoiceId_fkey" FOREIGN KEY ("precedingInvoiceId") REFERENCES "Invoice" ("id") ON DELETE SET NULL ON UPDATE CASCADE
);
INSERT INTO "new_Invoice" ("organizationId", "cancelledAt", "createdAt", "currency", "customerId", "documentType", "dueDate", "grossTotalCents", "id", "introText", "invoiceNumber", "issueDate", "issuedAt", "netTotalCents", "outroText", "paidTotalCents", "precedingInvoiceId", "purchaseOrderRef", "serviceDateFrom", "serviceDateTo", "snapshotBuyer", "snapshotSeller", "status", "taxScheme", "taxTotalCents", "templateId", "updatedAt") SELECT 'org_default', "cancelledAt", "createdAt", "currency", "customerId", "documentType", "dueDate", "grossTotalCents", "id", "introText", "invoiceNumber", "issueDate", "issuedAt", "netTotalCents", "outroText", "paidTotalCents", "precedingInvoiceId", "purchaseOrderRef", "serviceDateFrom", "serviceDateTo", "snapshotBuyer", "snapshotSeller", "status", "taxScheme", "taxTotalCents", "templateId", "updatedAt" FROM "Invoice";
DROP TABLE "Invoice";
ALTER TABLE "new_Invoice" RENAME TO "Invoice";
CREATE INDEX "Invoice_organizationId_status_dueDate_idx" ON "Invoice"("organizationId", "status", "dueDate");
CREATE INDEX "Invoice_organizationId_customerId_idx" ON "Invoice"("organizationId", "customerId");
CREATE INDEX "Invoice_organizationId_issueDate_idx" ON "Invoice"("organizationId", "issueDate");
CREATE INDEX "Invoice_organizationId_documentType_status_idx" ON "Invoice"("organizationId", "documentType", "status");
CREATE UNIQUE INDEX "Invoice_organizationId_invoiceNumber_key" ON "Invoice"("organizationId", "invoiceNumber");
CREATE TABLE "new_InvoiceLine" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "organizationId" TEXT NOT NULL,
    "invoiceId" TEXT NOT NULL,
    "position" INTEGER NOT NULL,
    "name" TEXT NOT NULL,
    "description" TEXT,
    "quantityScaled" INTEGER NOT NULL,
    "unitCode" TEXT NOT NULL DEFAULT 'C62',
    "unitPriceCents" INTEGER NOT NULL,
    "taxRateBasisPoints" INTEGER NOT NULL,
    "taxCategory" TEXT NOT NULL DEFAULT 'S',
    "discountBasisPoints" INTEGER NOT NULL DEFAULT 0,
    "lineNetCents" INTEGER NOT NULL,
    CONSTRAINT "InvoiceLine_organizationId_fkey" FOREIGN KEY ("organizationId") REFERENCES "Organization" ("id") ON DELETE CASCADE ON UPDATE CASCADE,
    CONSTRAINT "InvoiceLine_invoiceId_fkey" FOREIGN KEY ("invoiceId") REFERENCES "Invoice" ("id") ON DELETE CASCADE ON UPDATE CASCADE
);
INSERT INTO "new_InvoiceLine" ("organizationId", "description", "discountBasisPoints", "id", "invoiceId", "lineNetCents", "name", "position", "quantityScaled", "taxCategory", "taxRateBasisPoints", "unitCode", "unitPriceCents") SELECT 'org_default', "description", "discountBasisPoints", "id", "invoiceId", "lineNetCents", "name", "position", "quantityScaled", "taxCategory", "taxRateBasisPoints", "unitCode", "unitPriceCents" FROM "InvoiceLine";
DROP TABLE "InvoiceLine";
ALTER TABLE "new_InvoiceLine" RENAME TO "InvoiceLine";
CREATE INDEX "InvoiceLine_invoiceId_idx" ON "InvoiceLine"("invoiceId");
CREATE UNIQUE INDEX "InvoiceLine_invoiceId_position_key" ON "InvoiceLine"("invoiceId", "position");
CREATE TABLE "new_NumberSequence" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "organizationId" TEXT NOT NULL,
    "scope" TEXT NOT NULL,
    "lastValue" INTEGER NOT NULL DEFAULT 0,
    CONSTRAINT "NumberSequence_organizationId_fkey" FOREIGN KEY ("organizationId") REFERENCES "Organization" ("id") ON DELETE CASCADE ON UPDATE CASCADE
);
INSERT INTO "new_NumberSequence" ("organizationId", "id", "lastValue", "scope") SELECT 'org_default', "id", "lastValue", "scope" FROM "NumberSequence";
DROP TABLE "NumberSequence";
ALTER TABLE "new_NumberSequence" RENAME TO "NumberSequence";
CREATE UNIQUE INDEX "NumberSequence_organizationId_scope_key" ON "NumberSequence"("organizationId", "scope");
CREATE TABLE "new_Payment" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "organizationId" TEXT NOT NULL,
    "invoiceId" TEXT NOT NULL,
    "amountCents" INTEGER NOT NULL,
    "paidAt" TEXT NOT NULL,
    "method" TEXT,
    "note" TEXT,
    "createdAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT "Payment_organizationId_fkey" FOREIGN KEY ("organizationId") REFERENCES "Organization" ("id") ON DELETE CASCADE ON UPDATE CASCADE,
    CONSTRAINT "Payment_invoiceId_fkey" FOREIGN KEY ("invoiceId") REFERENCES "Invoice" ("id") ON DELETE CASCADE ON UPDATE CASCADE
);
INSERT INTO "new_Payment" ("organizationId", "amountCents", "createdAt", "id", "invoiceId", "method", "note", "paidAt") SELECT 'org_default', "amountCents", "createdAt", "id", "invoiceId", "method", "note", "paidAt" FROM "Payment";
DROP TABLE "Payment";
ALTER TABLE "new_Payment" RENAME TO "Payment";
CREATE INDEX "Payment_invoiceId_idx" ON "Payment"("invoiceId");
CREATE TABLE "new_User" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "organizationId" TEXT NOT NULL,
    "email" TEXT NOT NULL,
    "passwordHash" TEXT NOT NULL,
    "totpSecret" TEXT,
    "totpEnabled" BOOLEAN NOT NULL DEFAULT false,
    "failedLogins" INTEGER NOT NULL DEFAULT 0,
    "lockedUntil" DATETIME,
    "createdAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" DATETIME NOT NULL,
    CONSTRAINT "User_organizationId_fkey" FOREIGN KEY ("organizationId") REFERENCES "Organization" ("id") ON DELETE CASCADE ON UPDATE CASCADE
);
INSERT INTO "new_User" ("organizationId", "createdAt", "email", "failedLogins", "id", "lockedUntil", "passwordHash", "totpEnabled", "totpSecret", "updatedAt") SELECT 'org_default', "createdAt", "email", "failedLogins", "id", "lockedUntil", "passwordHash", "totpEnabled", "totpSecret", "updatedAt" FROM "User";
DROP TABLE "User";
ALTER TABLE "new_User" RENAME TO "User";
CREATE UNIQUE INDEX "User_email_key" ON "User"("email");
CREATE INDEX "User_organizationId_idx" ON "User"("organizationId");
PRAGMA foreign_keys=ON;
PRAGMA defer_foreign_keys=OFF;

-- ─────────────────────────────────────────────────────────────────────────────
-- Trigger nach dem Tabellenneuaufbau wiederherstellen
--
-- Der Neuaufbau oben hat AuditLog, Invoice und InvoiceLine verworfen und damit
-- auch ihre Trigger. Ohne diesen Abschnitt waeren Protokoll und
-- festgeschriebene Belege wieder aenderbar — der Verlust faellt sonst erst auf,
-- wenn jemand ihn ausnutzt.
-- ─────────────────────────────────────────────────────────────────────────────

-- NFA-COMP-02 (aus 20260810230000_audit_log_immutability)
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

-- FA-NUM-08, FA-NUM-09 (aus 20260810234500_invoice_immutability), ergaenzt um
-- organizationId: Die Zuordnung zum Mandanten ist ab dem Festschreiben Teil des
-- Belegs und darf sich nicht mehr aendern.
CREATE TRIGGER "Invoice_immutable_after_issue"
BEFORE UPDATE ON "Invoice"
FOR EACH ROW
WHEN OLD."status" <> 'DRAFT' AND (
       (NEW."status" = 'DRAFT')
    OR NEW."organizationId"              <> OLD."organizationId"
    OR NEW."customerId"                  <> OLD."customerId"
    OR NEW."documentType"                <> OLD."documentType"
    OR IFNULL(NEW."invoiceNumber",   '') <> IFNULL(OLD."invoiceNumber",   '')
    OR IFNULL(NEW."snapshotBuyer",   '') <> IFNULL(OLD."snapshotBuyer",   '')
    OR IFNULL(NEW."snapshotSeller",  '') <> IFNULL(OLD."snapshotSeller",  '')
    OR IFNULL(NEW."issueDate",       '') <> IFNULL(OLD."issueDate",       '')
    OR IFNULL(NEW."serviceDateFrom", '') <> IFNULL(OLD."serviceDateFrom", '')
    OR IFNULL(NEW."serviceDateTo",   '') <> IFNULL(OLD."serviceDateTo",   '')
    OR IFNULL(NEW."dueDate",         '') <> IFNULL(OLD."dueDate",         '')
    OR NEW."currency"                    <> OLD."currency"
    OR NEW."taxScheme"                   <> OLD."taxScheme"
    OR IFNULL(NEW."introText",       '') <> IFNULL(OLD."introText",       '')
    OR IFNULL(NEW."outroText",       '') <> IFNULL(OLD."outroText",       '')
    OR IFNULL(NEW."purchaseOrderRef",'') <> IFNULL(OLD."purchaseOrderRef",'')
    OR IFNULL(NEW."templateId",      '') <> IFNULL(OLD."templateId",      '')
    OR NEW."netTotalCents"               <> OLD."netTotalCents"
    OR NEW."taxTotalCents"               <> OLD."taxTotalCents"
    OR NEW."grossTotalCents"             <> OLD."grossTotalCents"
)
BEGIN
    SELECT RAISE(ABORT, 'Festgeschriebener Beleg ist unveraenderlich (FA-NUM-08, FA-NUM-09)');
END;

CREATE TRIGGER "Invoice_no_delete_after_issue"
BEFORE DELETE ON "Invoice"
FOR EACH ROW
WHEN OLD."status" <> 'DRAFT'
BEGIN
    SELECT RAISE(ABORT, 'Festgeschriebener Beleg wird storniert, nicht geloescht (FA-RECH-11)');
END;

CREATE TRIGGER "InvoiceLine_immutable_after_issue"
BEFORE UPDATE ON "InvoiceLine"
FOR EACH ROW
WHEN (SELECT "status" FROM "Invoice" WHERE "id" = OLD."invoiceId") <> 'DRAFT'
BEGIN
    SELECT RAISE(ABORT, 'Positionen eines festgeschriebenen Belegs sind unveraenderlich (FA-NUM-08)');
END;

CREATE TRIGGER "InvoiceLine_no_delete_after_issue"
BEFORE DELETE ON "InvoiceLine"
FOR EACH ROW
WHEN (SELECT "status" FROM "Invoice" WHERE "id" = OLD."invoiceId") <> 'DRAFT'
BEGIN
    SELECT RAISE(ABORT, 'Positionen eines festgeschriebenen Belegs sind unveraenderlich (FA-NUM-08)');
END;

-- ─────────────────────────────────────────────────────────────────────────────
-- Mandantengrenze auf Datenbankebene
--
-- Die Anwendung filtert ausschliesslich ueber die Repository-Schicht, die den
-- Organisationskontext als Pflichtparameter nimmt. Diese Trigger sind die
-- zweite Ebene: Sie fangen ab, dass ein Datensatz auf ein Objekt einer anderen
-- Organisation zeigt — unabhaengig davon, wer schreibt.
--
-- Sie ersetzen keine Row Level Security; SQLite kennt keine. Sie sichern die
-- Konsistenz der Spalte, auf der eine kuenftige RLS unter PostgreSQL (Spec §13)
-- aufsetzen wuerde.
-- ─────────────────────────────────────────────────────────────────────────────

CREATE TRIGGER "Invoice_organization_matches_insert"
BEFORE INSERT ON "Invoice"
FOR EACH ROW
WHEN NEW."organizationId" <> (SELECT "organizationId" FROM "Customer" WHERE "id" = NEW."customerId")
   OR (NEW."precedingInvoiceId" IS NOT NULL
       AND NEW."organizationId" <> (SELECT "organizationId" FROM "Invoice" WHERE "id" = NEW."precedingInvoiceId"))
BEGIN
    SELECT RAISE(ABORT, 'Beleg verweist auf Daten einer anderen Organisation');
END;

CREATE TRIGGER "Invoice_organization_matches_update"
BEFORE UPDATE ON "Invoice"
FOR EACH ROW
WHEN NEW."organizationId" <> (SELECT "organizationId" FROM "Customer" WHERE "id" = NEW."customerId")
   OR (NEW."precedingInvoiceId" IS NOT NULL
       AND NEW."organizationId" <> (SELECT "organizationId" FROM "Invoice" WHERE "id" = NEW."precedingInvoiceId"))
BEGIN
    SELECT RAISE(ABORT, 'Beleg verweist auf Daten einer anderen Organisation');
END;

CREATE TRIGGER "InvoiceLine_organization_matches_insert"
BEFORE INSERT ON "InvoiceLine"
FOR EACH ROW
WHEN NEW."organizationId" <> (SELECT "organizationId" FROM "Invoice" WHERE "id" = NEW."invoiceId")
BEGIN
    SELECT RAISE(ABORT, 'Position gehoert zu einer anderen Organisation als ihr Beleg');
END;

CREATE TRIGGER "InvoiceLine_organization_matches_update"
BEFORE UPDATE ON "InvoiceLine"
FOR EACH ROW
WHEN NEW."organizationId" <> (SELECT "organizationId" FROM "Invoice" WHERE "id" = NEW."invoiceId")
BEGIN
    SELECT RAISE(ABORT, 'Position gehoert zu einer anderen Organisation als ihr Beleg');
END;

CREATE TRIGGER "Payment_organization_matches_insert"
BEFORE INSERT ON "Payment"
FOR EACH ROW
WHEN NEW."organizationId" <> (SELECT "organizationId" FROM "Invoice" WHERE "id" = NEW."invoiceId")
BEGIN
    SELECT RAISE(ABORT, 'Zahlung gehoert zu einer anderen Organisation als ihr Beleg');
END;

CREATE TRIGGER "Payment_organization_matches_update"
BEFORE UPDATE ON "Payment"
FOR EACH ROW
WHEN NEW."organizationId" <> (SELECT "organizationId" FROM "Invoice" WHERE "id" = NEW."invoiceId")
BEGIN
    SELECT RAISE(ABORT, 'Zahlung gehoert zu einer anderen Organisation als ihr Beleg');
END;

CREATE TRIGGER "CompanyProfile_organization_matches_insert"
BEFORE INSERT ON "CompanyProfile"
FOR EACH ROW
WHEN NEW."logoAssetId" IS NOT NULL
 AND NEW."organizationId" <> (SELECT "organizationId" FROM "Asset" WHERE "id" = NEW."logoAssetId")
BEGIN
    SELECT RAISE(ABORT, 'Logo gehoert zu einer anderen Organisation');
END;

CREATE TRIGGER "CompanyProfile_organization_matches_update"
BEFORE UPDATE ON "CompanyProfile"
FOR EACH ROW
WHEN NEW."logoAssetId" IS NOT NULL
 AND NEW."organizationId" <> (SELECT "organizationId" FROM "Asset" WHERE "id" = NEW."logoAssetId")
BEGIN
    SELECT RAISE(ABORT, 'Logo gehoert zu einer anderen Organisation');
END;
