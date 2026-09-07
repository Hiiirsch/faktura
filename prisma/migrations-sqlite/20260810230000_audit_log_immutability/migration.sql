-- NFA-COMP-02: Das Audit-Log ist über die Anwendung nicht änderbar und nicht
-- löschbar.
--
-- Die Prisma-Erweiterung in src/infrastructure/db/immutability.ts weist
-- entsprechende Aufrufe bereits ab. Diese Trigger sind die zweite Ebene: Sie
-- greifen auch dann, wenn jemand mit einem eigenen Client oder über die
-- sqlite3-Kommandozeile schreibt.
--
-- Das Anlegen bleibt erlaubt — ein Protokoll, in das nichts geschrieben werden
-- kann, wäre nutzlos.

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
