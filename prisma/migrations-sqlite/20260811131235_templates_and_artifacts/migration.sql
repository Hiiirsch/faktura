-- M5: Vorlagen (Template) und erzeugte Belegdateien (InvoiceArtifact).
--
-- Der Fremdschlüssel von Invoice.templateId auf Template zwingt SQLite zum
-- Neuaufbau der Tabelle Invoice — und damit gehen erneut alle Trigger
-- verloren, die an ihr hängen oder sie lesen. Wie in
-- 20260811113615_organization_context werden sie deshalb vorher ausdrücklich
-- verworfen und am Ende neu angelegt.

-- Trigger vor dem Neuaufbau abräumen. Auch die auf InvoiceLine und Payment:
-- Sie lesen die Tabelle Invoice, und `ALTER TABLE … RENAME` bricht ab, solange
-- ein Trigger auf eine gerade nicht existierende Tabelle zeigt.
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

-- Muster für den Dateinamen erzeugter PDFs (FA-PDF-09).
--
-- Als einfaches ADD COLUMN mit Vorgabewert: SQLite baut die Tabelle dafür
-- nicht neu, die Trigger auf CompanyProfile bleiben unangetastet.
ALTER TABLE "CompanyProfile" ADD COLUMN "pdfFileNamePattern" TEXT NOT NULL DEFAULT '{NUMBER}';

-- CreateTable
CREATE TABLE "InvoiceArtifact" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "organizationId" TEXT NOT NULL,
    "invoiceId" TEXT NOT NULL,
    "kind" TEXT NOT NULL DEFAULT 'pdf',
    "filePath" TEXT NOT NULL,
    "sha256" TEXT NOT NULL,
    "byteSize" INTEGER NOT NULL,
    "fileName" TEXT NOT NULL,
    "createdAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT "InvoiceArtifact_organizationId_fkey" FOREIGN KEY ("organizationId") REFERENCES "Organization" ("id") ON DELETE CASCADE ON UPDATE CASCADE,
    CONSTRAINT "InvoiceArtifact_invoiceId_fkey" FOREIGN KEY ("invoiceId") REFERENCES "Invoice" ("id") ON DELETE CASCADE ON UPDATE CASCADE
);

-- CreateTable
CREATE TABLE "Template" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "organizationId" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "description" TEXT,
    "htmlSource" TEXT NOT NULL,
    "cssSource" TEXT NOT NULL,
    "pageFormat" TEXT NOT NULL DEFAULT 'A4',
    "marginTopMm" INTEGER NOT NULL DEFAULT 25,
    "marginRightMm" INTEGER NOT NULL DEFAULT 20,
    "marginBottomMm" INTEGER NOT NULL DEFAULT 20,
    "marginLeftMm" INTEGER NOT NULL DEFAULT 20,
    "isDefault" BOOLEAN NOT NULL DEFAULT false,
    "createdAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" DATETIME NOT NULL,
    CONSTRAINT "Template_organizationId_fkey" FOREIGN KEY ("organizationId") REFERENCES "Organization" ("id") ON DELETE CASCADE ON UPDATE CASCADE
);

-- RedefineTables
PRAGMA defer_foreign_keys=ON;
PRAGMA foreign_keys=OFF;
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

-- CreateIndex
CREATE INDEX "InvoiceArtifact_organizationId_createdAt_idx" ON "InvoiceArtifact"("organizationId", "createdAt");

-- CreateIndex
CREATE UNIQUE INDEX "InvoiceArtifact_invoiceId_kind_key" ON "InvoiceArtifact"("invoiceId", "kind");

-- CreateIndex
CREATE INDEX "Template_organizationId_idx" ON "Template"("organizationId");

-- CreateIndex
CREATE UNIQUE INDEX "Template_organizationId_name_key" ON "Template"("organizationId", "name");


-- ─────────────────────────────────────────────────────────────────────────────
-- Genau eine Standardvorlage je Organisation (FA-TPL-02)
--
-- Als partieller eindeutiger Index: Prisma kann ihn nicht ausdrücken, SQLite
-- schon. Ohne ihn hinge die Zusage allein daran, dass jede schreibende Stelle
-- vorher aufräumt — und die zweite, die es vergisst, hinterlässt zwei
-- Standardvorlagen, von denen willkürlich eine gewinnt.
-- ─────────────────────────────────────────────────────────────────────────────

CREATE UNIQUE INDEX "Template_one_default_per_organization"
ON "Template"("organizationId") WHERE "isDefault" = true;

-- ─────────────────────────────────────────────────────────────────────────────
-- Artefakte sind unveränderlich (Spec §4, FA-TPL-09)
--
-- Ein erzeugtes PDF ist der ausgelieferte Beleg. Ließe es sich überschreiben,
-- wäre der Hash daneben wertlos, und eine Vorlagenänderung könnte rückwirkend
-- verändern, was der Kunde bereits erhalten hat.
-- ─────────────────────────────────────────────────────────────────────────────

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

-- ─────────────────────────────────────────────────────────────────────────────
-- Trigger nach dem Tabellenneuaufbau wiederherstellen
-- ─────────────────────────────────────────────────────────────────────────────

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

CREATE TRIGGER "Invoice_organization_matches_insert"
BEFORE INSERT ON "Invoice"
FOR EACH ROW
WHEN NEW."organizationId" <> (SELECT "organizationId" FROM "Customer" WHERE "id" = NEW."customerId")
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
WHEN NEW."organizationId" <> (SELECT "organizationId" FROM "Customer" WHERE "id" = NEW."customerId")
   OR (NEW."precedingInvoiceId" IS NOT NULL
       AND NEW."organizationId" <> (SELECT "organizationId" FROM "Invoice" WHERE "id" = NEW."precedingInvoiceId"))
   OR (NEW."templateId" IS NOT NULL
       AND NEW."organizationId" <> (SELECT "organizationId" FROM "Template" WHERE "id" = NEW."templateId"))
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
