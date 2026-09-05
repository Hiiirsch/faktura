-- Protokoll der Verwaltung (M10, B2, FA-ADM-14)
--
-- Reine Neuanlage: eine Tabelle und zwei Trigger, keine bestehende wird
-- angefasst. Weder CHECK-Bedingungen noch vorhandene Trigger gehen verloren.
--
-- **Warum eine zweite Tabelle und kein Filter auf `AuditLog`.** Der erste Entwurf
-- wollte die Adminansicht aus `AuditLog WHERE actorKind = 'ADMIN'` speisen. Das
-- haette zwei Nachteile, und der zweite wiegt schwer:
--
-- 1. Vorgaenge **ohne** Unternehmensbezug haetten keinen Platz. `AuditLog`
--    verlangt eine `organizationId`; ein Betreiberkonto einzuladen oder zu
--    sperren betrifft aber kein Unternehmen. Genau diese Vorgaenge sind seit
--    M10/B1 moeglich, und sie waeren im Protokoll der Verwaltung nicht zu sehen
--    gewesen.
-- 2. Der Adminbereich muesste das Protokoll der Mandanten **lesen** duerfen, und
--    die Zusage aus FA-ADM-02 haenge dann an einem `where`. Ein vergessener
--    Filter waere ein Fenster in fremde Geschaeftsvorfaelle — Rechnungsnummern
--    und Betraege stehen dort im Klartext.
--
-- Mit einer eigenen Tabelle enthaelt die Abfrage der Verwaltung die fremden
-- Zeilen gar nicht erst. Der Preis ist eine doppelte Aufzeichnung fuer Eingriffe
-- mit Unternehmensbezug: einmal im Protokoll des Unternehmens, damit die
-- Betroffenen sie sehen (FA-ADM-07), und einmal hier.
--
-- **Unveraenderlich wie das Protokoll der Mandanten** (NFA-COMP-02): Ein
-- Protokoll, das sich nachtraeglich aendern laesst, ist keines. Die Trigger
-- greifen auch gegenueber einem Zugriff, der an der Repository-Schicht
-- vorbeigeht.

-- CreateTable
CREATE TABLE "PlatformAuditEntry" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "actorId" TEXT NOT NULL,
    "organizationId" TEXT,
    "entityType" TEXT NOT NULL,
    "entityId" TEXT NOT NULL,
    "action" TEXT NOT NULL,
    "detailsJson" TEXT,
    "ipAddress" TEXT,
    "createdAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP
);

-- CreateIndex
CREATE INDEX "PlatformAuditEntry_createdAt_idx" ON "PlatformAuditEntry"("createdAt");
CREATE INDEX "PlatformAuditEntry_actorId_idx" ON "PlatformAuditEntry"("actorId");

CREATE TRIGGER "PlatformAuditEntry_no_update"
BEFORE UPDATE ON "PlatformAuditEntry"
BEGIN
    SELECT RAISE(ABORT, 'PlatformAuditEntry ist unveraenderlich (NFA-COMP-02)');
END;

CREATE TRIGGER "PlatformAuditEntry_no_delete"
BEFORE DELETE ON "PlatformAuditEntry"
BEGIN
    SELECT RAISE(ABORT, 'PlatformAuditEntry ist unveraenderlich (NFA-COMP-02)');
END;
