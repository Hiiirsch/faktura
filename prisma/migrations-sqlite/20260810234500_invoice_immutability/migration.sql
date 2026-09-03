-- FA-NUM-08, FA-NUM-09: Nach dem Festschreiben sind Rechnung und Positionen
-- unveraenderlich — durchgesetzt nicht nur im Use Case, sondern in der
-- Persistenzschicht.
--
-- Als Trigger und nicht als Prisma-Erweiterung: Eine Erweiterung muesste den
-- Status des Belegs lesen, und diese Zusatzabfrage liefe innerhalb einer
-- Transaktion in einen Deadlock, weil SQLite nur eine Verbindung haelt. Ein
-- Trigger laeuft in derselben Transaktion und greift zudem auch dann, wenn
-- jemand ohne Prisma schreibt.
--
-- Aenderbar bleiben ausschliesslich: status, paidTotalCents, cancelledAt,
-- precedingInvoiceId, updatedAt. Alles andere ist ab dem Festschreiben fest.

CREATE TRIGGER "Invoice_immutable_after_issue"
BEFORE UPDATE ON "Invoice"
FOR EACH ROW
WHEN OLD."status" <> 'DRAFT' AND (
    -- Kein Rueckweg in den Entwurf: sonst liesse sich die Sperre umgehen,
    -- indem man den Status zuruecksetzt und danach den Inhalt aendert.
       (NEW."status" = 'DRAFT')
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
