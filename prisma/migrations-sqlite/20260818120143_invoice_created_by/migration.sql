-- Urheber am Beleg (M8, B6, FA-UI-16)
--
-- **Die gefaehrliche Migration.** Prisma hat hierfuer eine `RedefineTables`
-- erzeugt: neue Tabelle, Daten kopieren, `DROP TABLE "Invoice"`, umbenennen. Das
-- ist die uebliche Antwort von SQLite auf eine neue Spalte mit Fremdschluessel —
-- und sie haette **elf Trigger** mitgenommen: die vier auf `Invoice` selbst und
-- sieben weitere auf `InvoiceLine`, `Payment` und `InvoiceArtifact`, die
-- `Invoice` nur lesen.
--
-- Der Verlust waere doppelt unsichtbar gewesen: Die Anwendung liefe weiter, die
-- Tests liefen weiter, nur die Unveraenderbarkeit festgeschriebener Belege
-- (FA-NUM-08) und die Mandantengrenze waeren still weg.
--
-- Stattdessen von Hand: ein reines `ALTER TABLE ADD COLUMN`. SQLite erlaubt das
-- mit `REFERENCES`, solange die Spalte nullable ist und keinen Vorgabewert hat —
-- und genau das ist sie. Kein Neuaufbau, kein Triggerverlust.
--
-- Danach wird **ein** Trigger neu angelegt: `Invoice_immutable_after_issue` muss
-- die neue Spalte kennen. Ohne diese Zeile waere `createdById` an einem
-- festgeschriebenen Beleg still veraenderlich — die Urheberangabe liesse sich
-- nachtraeglich umschreiben, und das ist genau das Gegenteil dessen, wofuer sie
-- da ist.
--
-- `tests/integration/database-triggers.test.ts` haelt den Bestand fest.

-- AlterTable
ALTER TABLE "Invoice" ADD COLUMN "createdById" TEXT REFERENCES "User"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- ─── Unveraenderbarkeit um die neue Spalte erweitert ────────────────────────
--
-- Wortgleich zur Fassung aus `free_recipient`, ergaenzt um `createdById`.
DROP TRIGGER "Invoice_immutable_after_issue";

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
    OR IFNULL(NEW."createdById",      '') <> IFNULL(OLD."createdById",      '')
)
BEGIN
    SELECT RAISE(ABORT, 'Festgeschriebener Beleg ist unveraenderlich (FA-NUM-08, FA-NUM-09)');
END;
