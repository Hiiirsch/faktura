-- M5.7: Empfänger ohne hinterlegten Kunden.
--
-- `customerId` wird optional; `buyerMode` entscheidet, woher der Empfänger
-- stammt. Bestandsbelege behalten den Modus `CUSTOMER` — der Vorgabewert der
-- Spalte trifft genau ihren Zustand.
--
-- SQLite baut die Tabelle Invoice dafür neu auf. Damit gehen **alle** Trigger
-- verloren, auch die auf InvoiceLine, Payment und InvoiceArtifact, die Invoice
-- nur lesen: `ALTER TABLE … RENAME` bricht ab, solange ein Trigger auf eine
-- gerade nicht existierende Tabelle zeigt. Sie werden deshalb vorher
-- ausdrücklich verworfen und am Ende neu angelegt.

DROP TRIGGER IF EXISTS "Invoice_immutable_after_issue";
DROP TRIGGER IF EXISTS "Invoice_no_delete_after_issue";
DROP TRIGGER IF EXISTS "Invoice_organization_matches_insert";
DROP TRIGGER IF EXISTS "Invoice_organization_matches_update";
DROP TRIGGER IF EXISTS "InvoiceLine_immutable_after_issue";
DROP TRIGGER IF EXISTS "InvoiceLine_no_delete_after_issue";
DROP TRIGGER IF EXISTS "InvoiceLine_organization_matches_insert";
DROP TRIGGER IF EXISTS "InvoiceLine_organization_matches_update";
DROP TRIGGER IF EXISTS "Payment_organization_matches_insert";
DROP TRIGGER IF EXISTS "Payment_organization_matches_update";
DROP TRIGGER IF EXISTS "InvoiceArtifact_no_update";
DROP TRIGGER IF EXISTS "InvoiceArtifact_organization_matches_insert";

-- RedefineTables
PRAGMA defer_foreign_keys=ON;
PRAGMA foreign_keys=OFF;
CREATE TABLE "new_Invoice" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "organizationId" TEXT NOT NULL,
    "documentType" TEXT NOT NULL DEFAULT 'INVOICE',
    "invoiceNumber" TEXT,
    "status" TEXT NOT NULL DEFAULT 'DRAFT',
    "buyerMode" TEXT NOT NULL DEFAULT 'CUSTOMER',
    "customerId" TEXT,
    "buyerName" TEXT,
    "buyerContactName" TEXT,
    "buyerAddressLine1" TEXT,
    "buyerAddressLine2" TEXT,
    "buyerPostalCode" TEXT,
    "buyerCity" TEXT,
    "buyerCountryCode" TEXT,
    "buyerEmail" TEXT,
    "buyerPhone" TEXT,
    "buyerVatId" TEXT,
    "buyerFreeText" TEXT,
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
    CONSTRAINT "Invoice_customerId_fkey" FOREIGN KEY ("customerId") REFERENCES "Customer" ("id") ON DELETE SET NULL ON UPDATE CASCADE,
    CONSTRAINT "Invoice_precedingInvoiceId_fkey" FOREIGN KEY ("precedingInvoiceId") REFERENCES "Invoice" ("id") ON DELETE SET NULL ON UPDATE CASCADE,
    CONSTRAINT "Invoice_templateId_fkey" FOREIGN KEY ("templateId") REFERENCES "Template" ("id") ON DELETE SET NULL ON UPDATE CASCADE
);
INSERT INTO "new_Invoice" ("cancelledAt", "createdAt", "currency", "customerId", "documentType", "dueDate", "grossTotalCents", "id", "introText", "invoiceNumber", "issueDate", "issuedAt", "netTotalCents", "organizationId", "outroText", "paidTotalCents", "precedingInvoiceId", "purchaseOrderRef", "serviceDateFrom", "serviceDateTo", "snapshotBuyer", "snapshotSeller", "status", "taxScheme", "taxTotalCents", "templateId", "updatedAt") SELECT "cancelledAt", "createdAt", "currency", "customerId", "documentType", "dueDate", "grossTotalCents", "id", "introText", "invoiceNumber", "issueDate", "issuedAt", "netTotalCents", "organizationId", "outroText", "paidTotalCents", "precedingInvoiceId", "purchaseOrderRef", "serviceDateFrom", "serviceDateTo", "snapshotBuyer", "snapshotSeller", "status", "taxScheme", "taxTotalCents", "templateId", "updatedAt" FROM "Invoice";
DROP TABLE "Invoice";
ALTER TABLE "new_Invoice" RENAME TO "Invoice";
CREATE INDEX "Invoice_organizationId_status_dueDate_idx" ON "Invoice"("organizationId", "status", "dueDate");
CREATE INDEX "Invoice_organizationId_customerId_idx" ON "Invoice"("organizationId", "customerId");
CREATE INDEX "Invoice_organizationId_issueDate_idx" ON "Invoice"("organizationId", "issueDate");
CREATE INDEX "Invoice_organizationId_documentType_status_idx" ON "Invoice"("organizationId", "documentType", "status");
CREATE UNIQUE INDEX "Invoice_organizationId_invoiceNumber_key" ON "Invoice"("organizationId", "invoiceNumber");
PRAGMA foreign_keys=ON;
PRAGMA defer_foreign_keys=OFF;


-- ─────────────────────────────────────────────────────────────────────────────
-- Trigger wiederherstellen
-- ─────────────────────────────────────────────────────────────────────────────

-- FA-NUM-08, FA-NUM-09: Ab dem Festschreiben ist der Beleg unveränderlich —
-- **einschließlich des Empfängers**, gleich aus welcher Quelle er stammt. Ohne
-- die neuen Spalten in dieser Liste ließe sich die Anschrift eines
-- festgeschriebenen Belegs nachträglich austauschen.
--
-- `customerId` steht jetzt in IFNULL: Ein Wechsel von einer Kennung auf NULL
-- (und zurück) ergäbe sonst `NULL` statt `wahr` und rutschte durch.
CREATE TRIGGER "Invoice_immutable_after_issue"
BEFORE UPDATE ON "Invoice"
FOR EACH ROW
WHEN OLD."status" <> 'DRAFT' AND (
       (NEW."status" = 'DRAFT')
    OR NEW."organizationId"               <> OLD."organizationId"
    OR IFNULL(NEW."customerId",       '') <> IFNULL(OLD."customerId",       '')
    OR NEW."buyerMode"                    <> OLD."buyerMode"
    OR IFNULL(NEW."buyerName",        '') <> IFNULL(OLD."buyerName",        '')
    OR IFNULL(NEW."buyerContactName", '') <> IFNULL(OLD."buyerContactName", '')
    OR IFNULL(NEW."buyerAddressLine1",'') <> IFNULL(OLD."buyerAddressLine1",'')
    OR IFNULL(NEW."buyerAddressLine2",'') <> IFNULL(OLD."buyerAddressLine2",'')
    OR IFNULL(NEW."buyerPostalCode",  '') <> IFNULL(OLD."buyerPostalCode",  '')
    OR IFNULL(NEW."buyerCity",        '') <> IFNULL(OLD."buyerCity",        '')
    OR IFNULL(NEW."buyerCountryCode", '') <> IFNULL(OLD."buyerCountryCode", '')
    OR IFNULL(NEW."buyerEmail",       '') <> IFNULL(OLD."buyerEmail",       '')
    OR IFNULL(NEW."buyerPhone",       '') <> IFNULL(OLD."buyerPhone",       '')
    OR IFNULL(NEW."buyerVatId",       '') <> IFNULL(OLD."buyerVatId",       '')
    OR IFNULL(NEW."buyerFreeText",    '') <> IFNULL(OLD."buyerFreeText",    '')
    OR NEW."documentType"                 <> OLD."documentType"
    OR IFNULL(NEW."invoiceNumber",    '') <> IFNULL(OLD."invoiceNumber",    '')
    OR IFNULL(NEW."snapshotBuyer",    '') <> IFNULL(OLD."snapshotBuyer",    '')
    OR IFNULL(NEW."snapshotSeller",   '') <> IFNULL(OLD."snapshotSeller",   '')
    OR IFNULL(NEW."issueDate",        '') <> IFNULL(OLD."issueDate",        '')
    OR IFNULL(NEW."serviceDateFrom",  '') <> IFNULL(OLD."serviceDateFrom",  '')
    OR IFNULL(NEW."serviceDateTo",    '') <> IFNULL(OLD."serviceDateTo",    '')
    OR IFNULL(NEW."dueDate",          '') <> IFNULL(OLD."dueDate",          '')
    OR NEW."currency"                     <> OLD."currency"
    OR NEW."taxScheme"                    <> OLD."taxScheme"
    OR IFNULL(NEW."introText",        '') <> IFNULL(OLD."introText",        '')
    OR IFNULL(NEW."outroText",        '') <> IFNULL(OLD."outroText",        '')
    OR IFNULL(NEW."purchaseOrderRef", '') <> IFNULL(OLD."purchaseOrderRef", '')
    OR IFNULL(NEW."templateId",       '') <> IFNULL(OLD."templateId",       '')
    OR NEW."netTotalCents"                <> OLD."netTotalCents"
    OR NEW."taxTotalCents"                <> OLD."taxTotalCents"
    OR NEW."grossTotalCents"              <> OLD."grossTotalCents"
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

-- Mandantengrenze. Der Kundenbezug wird nur geprüft, wenn es einen gibt:
-- Ohne die ausdrückliche NULL-Abfrage ergäbe `'org' <> (SELECT … WHERE id = NULL)`
-- den Wert NULL, der WHEN-Zweig fiele aus, und die Prüfung hinge stillschweigend
-- an der NULL-Semantik von SQLite statt an einer Aussage.
CREATE TRIGGER "Invoice_organization_matches_insert"
BEFORE INSERT ON "Invoice"
FOR EACH ROW
WHEN (NEW."customerId" IS NOT NULL
      AND NEW."organizationId" <> (SELECT "organizationId" FROM "Customer" WHERE "id" = NEW."customerId"))
   OR (NEW."precedingInvoiceId" IS NOT NULL
       AND NEW."organizationId" <> (SELECT "organizationId" FROM "Invoice" WHERE "id" = NEW."precedingInvoiceId"))
   OR (NEW."templateId" IS NOT NULL
       AND NEW."organizationId" <> (SELECT "organizationId" FROM "Template" WHERE "id" = NEW."templateId"))
BEGIN
    SELECT RAISE(ABORT, 'Beleg verweist auf Daten einer anderen Organisation');
END;

CREATE TRIGGER "Invoice_organization_matches_update"
BEFORE UPDATE ON "Invoice"
FOR EACH ROW
WHEN (NEW."customerId" IS NOT NULL
      AND NEW."organizationId" <> (SELECT "organizationId" FROM "Customer" WHERE "id" = NEW."customerId"))
   OR (NEW."precedingInvoiceId" IS NOT NULL
       AND NEW."organizationId" <> (SELECT "organizationId" FROM "Invoice" WHERE "id" = NEW."precedingInvoiceId"))
   OR (NEW."templateId" IS NOT NULL
       AND NEW."organizationId" <> (SELECT "organizationId" FROM "Template" WHERE "id" = NEW."templateId"))
BEGIN
    SELECT RAISE(ABORT, 'Beleg verweist auf Daten einer anderen Organisation');
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

CREATE TRIGGER "InvoiceArtifact_no_update"
BEFORE UPDATE ON "InvoiceArtifact"
BEGIN
    SELECT RAISE(ABORT, 'Erzeugte Belegdateien sind unveraenderlich (FA-TPL-09)');
END;

CREATE TRIGGER "InvoiceArtifact_organization_matches_insert"
BEFORE INSERT ON "InvoiceArtifact"
FOR EACH ROW
WHEN NEW."organizationId" <> (SELECT "organizationId" FROM "Invoice" WHERE "id" = NEW."invoiceId")
BEGIN
    SELECT RAISE(ABORT, 'Artefakt gehoert zu einer anderen Organisation als sein Beleg');
END;
