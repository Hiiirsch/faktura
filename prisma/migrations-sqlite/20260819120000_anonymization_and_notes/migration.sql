-- Anonymisieren und interne Notiz (M10, B3/B4, FA-ADM-15, FA-ADM-16)
--
-- **Zwei Spalten, kein Neuaufbau.** Beide sind nullable und ohne Vorgabewert,
-- also erlaubt SQLite ein reines `ALTER TABLE ADD COLUMN`. Das ist hier keine
-- Bequemlichkeit, sondern Pflicht: Prisma erzeugt fuer solche Aenderungen unter
-- SQLite gern eine `RedefineTables`-Migration, und die haette die vier Trigger
-- auf `User` mitgenommen — zwei fuer die Mandantengrenze der Rolle, zwei fuer
-- die Aussperrsicherung. Dieselbe Falle wie in M8/B6.
--
-- **`User.anonymizedAt`.** Ein Konto wird nie geloescht: `Invoice.createdById`
-- ist ein echter Fremdschluessel, damit ein Beleg seinen Urheber behaelt, und
-- `AuditLog.actorId` nennt Akteure ueber ihre Kennung. Anonymisieren haelt beide
-- Zusagen und entfernt trotzdem die Person.
--
-- **`Organization.note`.** Eine Notiz, die nur der Betreiber sieht. Sie steht
-- absichtlich an `Organization` und nicht in einer eigenen Tabelle: Es gibt
-- genau eine je Unternehmen, und eine Tabelle dafuer waere ein Verweis mehr
-- ohne einen Fall, der ihn braucht.

ALTER TABLE "User" ADD COLUMN "anonymizedAt" DATETIME;

ALTER TABLE "Organization" ADD COLUMN "note" TEXT;
