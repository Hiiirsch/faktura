-- Die Zusagen, die in der Datenbank stehen (M17)
--
-- Die Baseline daneben ist reines Prisma-Schema: Tabellen, Spalten, Indizes.
-- Was diese Anwendung ausmacht, steht hier — 11 CHECK-Bedingungen, drei
-- partielle Indizes und 32 Trigger. Sie sind aus der SQLite-Fassung
-- uebertragen, einzeln und im Wortlaut ihrer Meldungen.
--
-- **Warum ueberhaupt Trigger und keine Pruefung im Anwendungscode.** Um zu
-- entscheiden, ob ein Beleg festgeschrieben ist, muesste eine Erweiterung
-- seinen Status lesen. Trigger laufen in derselben Transaktion und greifen
-- auch dann, wenn jemand mit `psql` an der Anwendung vorbeigeht.
--
-- **Drei Unterschiede zu SQLite, alle erzwungen:**
--
-- 1. PostgreSQL erlaubt **keine Unterabfrage in der `WHEN`-Klausel** eines
--    Triggers. Wo die Bedingung eine braucht, steht sie im Funktionsrumpf;
--    wo nicht, bleibt sie in `WHEN` und spart den Funktionsaufruf.
-- 2. `RAISE(ABORT, …)` wird `RAISE EXCEPTION`, `IFNULL` wird `COALESCE`,
--    `GLOB` wird ein regulaerer Ausdruck.
-- 3. Ein `BEFORE`-Trigger muss `NEW` (INSERT/UPDATE) beziehungsweise `OLD`
--    (DELETE) zurueckgeben, sonst faellt die Zeile still unter den Tisch.
--
-- Die NULL-Semantik bleibt dabei erhalten: `NEW."x" <> (SELECT …)` ergibt
-- NULL, wenn die Unterabfrage nichts findet, und ein `IF NULL THEN` ist
-- unwahr — in beiden Datenbanken. Wo das nicht genuegte, stand schon in der
-- SQLite-Fassung ein ausdrueckliches `IS NOT NULL` davor.

-- ─── CHECK-Bedingungen ──────────────────────────────────────────────────────

ALTER TABLE "PendingLogin" ADD CONSTRAINT "PendingLogin_exactly_one_account" CHECK (
    ("userId" IS NOT NULL AND "adminUserId" IS NULL)
 OR ("userId" IS NULL AND "adminUserId" IS NOT NULL)
);

ALTER TABLE "Invitation" ADD CONSTRAINT "Invitation_email_not_empty"
    CHECK (length(trim("email")) > 0);

ALTER TABLE "Invitation" ADD CONSTRAINT "Invitation_accepted_xor_revoked"
    CHECK ("acceptedAt" IS NULL OR "revokedAt" IS NULL);

ALTER TABLE "WebAuthnCredential" ADD CONSTRAINT "WebAuthnCredential_exactly_one_account" CHECK (
    ("userId" IS NOT NULL AND "adminUserId" IS NULL)
 OR ("userId" IS NULL AND "adminUserId" IS NOT NULL)
);

ALTER TABLE "WebAuthnChallenge" ADD CONSTRAINT "WebAuthnChallenge_at_most_one_account"
    CHECK ("userId" IS NULL OR "adminUserId" IS NULL);

ALTER TABLE "WebAuthnChallenge" ADD CONSTRAINT "WebAuthnChallenge_known_kind"
    CHECK ("kind" IN ('REGISTER', 'AUTHENTICATE'));

ALTER TABLE "Reminder" ADD CONSTRAINT "Reminder_level_range"
    CHECK ("level" BETWEEN 1 AND 3);

ALTER TABLE "Reminder" ADD CONSTRAINT "Reminder_outstanding_positive"
    CHECK ("outstandingCents" > 0);

ALTER TABLE "Reminder" ADD CONSTRAINT "Reminder_fee_not_negative"
    CHECK ("feeCents" >= 0);

ALTER TABLE "Reminder" ADD CONSTRAINT "Reminder_total_is_sum"
    CHECK ("totalCents" = "outstandingCents" + "feeCents");

-- `GLOB '[0-9][0-9][0-9][0-9]-…'` unter SQLite. Derselbe Zweck: Kalendertage
-- stehen als YYYY-MM-DD, nicht als Zeitpunkt (CLAUDE.md, Regel 7).
ALTER TABLE "Reminder" ADD CONSTRAINT "Reminder_dates_are_days" CHECK (
    "issueDate" ~ '^[0-9]{4}-[0-9]{2}-[0-9]{2}$'
AND "dueDate"   ~ '^[0-9]{4}-[0-9]{2}-[0-9]{2}$'
);

-- ─── Partielle eindeutige Indizes ───────────────────────────────────────────
--
-- Je Adresse hoechstens eine **offene** Einladung. Die Frist kennt der Index
-- bewusst nicht: Ein Index-WHERE darf keine Uhrzeit nennen. Eine abgelaufene
-- Einladung gilt hier weiter als offen; `inviteMember` zieht deshalb erst
-- zurueck und stellt dann aus.

-- Genau eine Standardvorlage je Unternehmen. Ein zweiter Beleg wuesste sonst
-- nicht, mit welcher er gesetzt wird — und die Antwort haenge an der
-- Reihenfolge der Zeilen.
CREATE UNIQUE INDEX "Template_one_default_per_organization"
ON "Template"("organizationId")
WHERE "isDefault" = true;

CREATE UNIQUE INDEX "Invitation_one_open_per_email"
ON "Invitation"("email")
WHERE "acceptedAt" IS NULL AND "revokedAt" IS NULL;

CREATE UNIQUE INDEX "AdminInvitation_one_open_per_email"
ON "AdminInvitation"("email")
WHERE "acceptedAt" IS NULL AND "revokedAt" IS NULL;

-- ─── Mandantengrenzen ───────────────────────────────────────────────────────
--
-- Ein falscher `organizationId` verschiebt eine Grenze. Deshalb Trigger und
-- nicht nur ein Typ: Der Typ schuetzt vor Vergessen, der Trigger vor Umgehen.

CREATE FUNCTION "fn_CompanyProfile_organization_matches"() RETURNS trigger
LANGUAGE plpgsql AS $$
BEGIN
    IF NEW."logoAssetId" IS NOT NULL
       AND NEW."organizationId" <> (SELECT "organizationId" FROM "Asset" WHERE "id" = NEW."logoAssetId")
    THEN
        RAISE EXCEPTION 'Logo gehoert zu einer anderen Organisation';
    END IF;
    RETURN NEW;
END;
$$;

CREATE TRIGGER "CompanyProfile_organization_matches_insert"
BEFORE INSERT ON "CompanyProfile" FOR EACH ROW
EXECUTE FUNCTION "fn_CompanyProfile_organization_matches"();

CREATE TRIGGER "CompanyProfile_organization_matches_update"
BEFORE UPDATE ON "CompanyProfile" FOR EACH ROW
EXECUTE FUNCTION "fn_CompanyProfile_organization_matches"();

CREATE FUNCTION "fn_Invoice_organization_matches"() RETURNS trigger
LANGUAGE plpgsql AS $$
BEGIN
    -- Der Kundenbezug wird nur geprueft, wenn es einen gibt: Ohne die
    -- ausdrueckliche NULL-Abfrage haenge die Pruefung an der NULL-Semantik
    -- statt an einer Aussage.
    IF (NEW."customerId" IS NOT NULL
        AND NEW."organizationId" <> (SELECT "organizationId" FROM "Customer" WHERE "id" = NEW."customerId"))
    OR (NEW."precedingInvoiceId" IS NOT NULL
        AND NEW."organizationId" <> (SELECT "organizationId" FROM "Invoice" WHERE "id" = NEW."precedingInvoiceId"))
    OR (NEW."templateId" IS NOT NULL
        AND NEW."organizationId" <> (SELECT "organizationId" FROM "Template" WHERE "id" = NEW."templateId"))
    THEN
        RAISE EXCEPTION 'Beleg verweist auf Daten einer anderen Organisation';
    END IF;
    RETURN NEW;
END;
$$;

CREATE TRIGGER "Invoice_organization_matches_insert"
BEFORE INSERT ON "Invoice" FOR EACH ROW
EXECUTE FUNCTION "fn_Invoice_organization_matches"();

CREATE TRIGGER "Invoice_organization_matches_update"
BEFORE UPDATE ON "Invoice" FOR EACH ROW
EXECUTE FUNCTION "fn_Invoice_organization_matches"();

CREATE FUNCTION "fn_InvoiceLine_organization_matches"() RETURNS trigger
LANGUAGE plpgsql AS $$
BEGIN
    IF NEW."organizationId" <> (SELECT "organizationId" FROM "Invoice" WHERE "id" = NEW."invoiceId") THEN
        RAISE EXCEPTION 'Position gehoert zu einer anderen Organisation als ihr Beleg';
    END IF;
    RETURN NEW;
END;
$$;

CREATE TRIGGER "InvoiceLine_organization_matches_insert"
BEFORE INSERT ON "InvoiceLine" FOR EACH ROW
EXECUTE FUNCTION "fn_InvoiceLine_organization_matches"();

CREATE TRIGGER "InvoiceLine_organization_matches_update"
BEFORE UPDATE ON "InvoiceLine" FOR EACH ROW
EXECUTE FUNCTION "fn_InvoiceLine_organization_matches"();

CREATE FUNCTION "fn_Payment_organization_matches"() RETURNS trigger
LANGUAGE plpgsql AS $$
BEGIN
    IF NEW."organizationId" <> (SELECT "organizationId" FROM "Invoice" WHERE "id" = NEW."invoiceId") THEN
        RAISE EXCEPTION 'Zahlung gehoert zu einer anderen Organisation als ihr Beleg';
    END IF;
    RETURN NEW;
END;
$$;

CREATE TRIGGER "Payment_organization_matches_insert"
BEFORE INSERT ON "Payment" FOR EACH ROW
EXECUTE FUNCTION "fn_Payment_organization_matches"();

CREATE TRIGGER "Payment_organization_matches_update"
BEFORE UPDATE ON "Payment" FOR EACH ROW
EXECUTE FUNCTION "fn_Payment_organization_matches"();

CREATE FUNCTION "fn_InvoiceArtifact_organization_matches"() RETURNS trigger
LANGUAGE plpgsql AS $$
BEGIN
    IF NEW."organizationId" <> (SELECT "organizationId" FROM "Invoice" WHERE "id" = NEW."invoiceId") THEN
        RAISE EXCEPTION 'Artefakt gehoert zu einer anderen Organisation als sein Beleg';
    END IF;
    RETURN NEW;
END;
$$;

CREATE TRIGGER "InvoiceArtifact_organization_matches_insert"
BEFORE INSERT ON "InvoiceArtifact" FOR EACH ROW
EXECUTE FUNCTION "fn_InvoiceArtifact_organization_matches"();

CREATE FUNCTION "fn_RolePermission_organization_matches"() RETURNS trigger
LANGUAGE plpgsql AS $$
BEGIN
    IF NEW."organizationId" <> (SELECT "organizationId" FROM "Role" WHERE "id" = NEW."roleId") THEN
        RAISE EXCEPTION 'Berechtigung gehoert zu einer anderen Organisation als ihre Rolle';
    END IF;
    RETURN NEW;
END;
$$;

CREATE TRIGGER "RolePermission_organization_matches_insert"
BEFORE INSERT ON "RolePermission" FOR EACH ROW
EXECUTE FUNCTION "fn_RolePermission_organization_matches"();

CREATE TRIGGER "RolePermission_organization_matches_update"
BEFORE UPDATE ON "RolePermission" FOR EACH ROW
EXECUTE FUNCTION "fn_RolePermission_organization_matches"();

CREATE FUNCTION "fn_User_role_matches_organization"() RETURNS trigger
LANGUAGE plpgsql AS $$
BEGIN
    IF NEW."roleId" IS NOT NULL
       AND NEW."organizationId" <> (SELECT "organizationId" FROM "Role" WHERE "id" = NEW."roleId")
    THEN
        RAISE EXCEPTION 'Konto verweist auf eine Rolle einer anderen Organisation';
    END IF;
    RETURN NEW;
END;
$$;

CREATE TRIGGER "User_role_matches_organization_insert"
BEFORE INSERT ON "User" FOR EACH ROW
EXECUTE FUNCTION "fn_User_role_matches_organization"();

CREATE TRIGGER "User_role_matches_organization_update"
BEFORE UPDATE ON "User" FOR EACH ROW
EXECUTE FUNCTION "fn_User_role_matches_organization"();

CREATE FUNCTION "fn_Invitation_role_matches_organization"() RETURNS trigger
LANGUAGE plpgsql AS $$
BEGIN
    IF (SELECT "organizationId" FROM "Role" WHERE "id" = NEW."roleId") <> NEW."organizationId" THEN
        RAISE EXCEPTION 'Rolle gehört zu einer anderen Organisation';
    END IF;
    RETURN NULL;
END;
$$;

CREATE TRIGGER "Invitation_role_matches_organization_insert"
AFTER INSERT ON "Invitation" FOR EACH ROW
EXECUTE FUNCTION "fn_Invitation_role_matches_organization"();

CREATE TRIGGER "Invitation_role_matches_organization_update"
AFTER UPDATE OF "roleId", "organizationId" ON "Invitation" FOR EACH ROW
EXECUTE FUNCTION "fn_Invitation_role_matches_organization"();

CREATE FUNCTION "fn_Reminder_organization_matches"() RETURNS trigger
LANGUAGE plpgsql AS $$
BEGIN
    IF NEW."organizationId" <> (SELECT "organizationId" FROM "Invoice" WHERE "id" = NEW."invoiceId") THEN
        RAISE EXCEPTION 'Mahnung gehoert zu einer anderen Organisation als ihr Beleg';
    END IF;
    RETURN NEW;
END;
$$;

CREATE TRIGGER "Reminder_organization_matches_insert"
BEFORE INSERT ON "Reminder" FOR EACH ROW
EXECUTE FUNCTION "fn_Reminder_organization_matches"();

CREATE FUNCTION "fn_ReminderArtifact_organization_matches"() RETURNS trigger
LANGUAGE plpgsql AS $$
BEGIN
    IF NEW."organizationId" <> (SELECT "organizationId" FROM "Reminder" WHERE "id" = NEW."reminderId") THEN
        RAISE EXCEPTION 'Artefakt gehoert zu einer anderen Organisation als seine Mahnung';
    END IF;
    RETURN NEW;
END;
$$;

CREATE TRIGGER "ReminderArtifact_organization_matches_insert"
BEFORE INSERT ON "ReminderArtifact" FOR EACH ROW
EXECUTE FUNCTION "fn_ReminderArtifact_organization_matches"();

-- ─── Unveraenderbarkeit ─────────────────────────────────────────────────────

CREATE FUNCTION "fn_reject_change"() RETURNS trigger
LANGUAGE plpgsql AS $$
BEGIN
    -- Die Meldung kommt als Argument aus der Triggerdefinition: Elf Trigger
    -- sagen dasselbe in verschiedenen Worten, und elf gleiche Funktionen
    -- nebeneinander waeren elf Stellen, an denen jemand eine vergisst.
    RAISE EXCEPTION '%', TG_ARGV[0];
END;
$$;

CREATE TRIGGER "InvoiceArtifact_no_update"
BEFORE UPDATE ON "InvoiceArtifact" FOR EACH ROW
EXECUTE FUNCTION "fn_reject_change"('Erzeugte Belegdateien sind unveraenderlich (FA-TPL-09)');

CREATE TRIGGER "AuditLog_no_update"
BEFORE UPDATE ON "AuditLog" FOR EACH ROW
EXECUTE FUNCTION "fn_reject_change"('AuditLog ist unveraenderlich (NFA-COMP-02)');

CREATE TRIGGER "AuditLog_no_delete"
BEFORE DELETE ON "AuditLog" FOR EACH ROW
EXECUTE FUNCTION "fn_reject_change"('AuditLog ist unveraenderlich (NFA-COMP-02)');

CREATE TRIGGER "PlatformAuditEntry_no_update"
BEFORE UPDATE ON "PlatformAuditEntry" FOR EACH ROW
EXECUTE FUNCTION "fn_reject_change"('PlatformAuditEntry ist unveraenderlich (NFA-COMP-02)');

CREATE TRIGGER "PlatformAuditEntry_no_delete"
BEFORE DELETE ON "PlatformAuditEntry" FOR EACH ROW
EXECUTE FUNCTION "fn_reject_change"('PlatformAuditEntry ist unveraenderlich (NFA-COMP-02)');

CREATE TRIGGER "Reminder_no_update"
BEFORE UPDATE ON "Reminder" FOR EACH ROW
EXECUTE FUNCTION "fn_reject_change"('Mahnungen sind unveraenderlich (FA-MAHN-05)');

CREATE TRIGGER "Reminder_no_delete"
BEFORE DELETE ON "Reminder" FOR EACH ROW
EXECUTE FUNCTION "fn_reject_change"('Mahnungen werden nicht geloescht (FA-MAHN-05)');

CREATE TRIGGER "ReminderArtifact_no_update"
BEFORE UPDATE ON "ReminderArtifact" FOR EACH ROW
EXECUTE FUNCTION "fn_reject_change"('Erzeugte Mahnungsdateien sind unveraenderlich');

-- Der festgeschriebene Beleg.
--
-- Aenderbar bleiben nur Status (ausser zurueck auf Entwurf), Zahlungsstand und
-- Stornovermerk. Die Bedingung braucht **keine** Unterabfrage und bleibt
-- deshalb in `WHEN`: So faellt sie fuer jeden Entwurf weg, ohne dass eine
-- Funktion aufgerufen wird.
CREATE FUNCTION "fn_Invoice_immutable_after_issue"() RETURNS trigger
LANGUAGE plpgsql AS $$
BEGIN
    RAISE EXCEPTION 'Festgeschriebener Beleg ist unveraenderlich (FA-NUM-08, FA-NUM-09)';
END;
$$;

CREATE TRIGGER "Invoice_immutable_after_issue"
BEFORE UPDATE ON "Invoice" FOR EACH ROW
WHEN (OLD."status" <> 'DRAFT' AND (
       (NEW."status" = 'DRAFT')
    OR NEW."organizationId"                 <> OLD."organizationId"
    OR COALESCE(NEW."customerId",       '') <> COALESCE(OLD."customerId",       '')
    OR NEW."buyerMode"                      <> OLD."buyerMode"
    OR COALESCE(NEW."buyerName",        '') <> COALESCE(OLD."buyerName",        '')
    OR COALESCE(NEW."buyerContactName", '') <> COALESCE(OLD."buyerContactName", '')
    OR COALESCE(NEW."buyerAddressLine1",'') <> COALESCE(OLD."buyerAddressLine1",'')
    OR COALESCE(NEW."buyerAddressLine2",'') <> COALESCE(OLD."buyerAddressLine2",'')
    OR COALESCE(NEW."buyerPostalCode",  '') <> COALESCE(OLD."buyerPostalCode",  '')
    OR COALESCE(NEW."buyerCity",        '') <> COALESCE(OLD."buyerCity",        '')
    OR COALESCE(NEW."buyerCountryCode", '') <> COALESCE(OLD."buyerCountryCode", '')
    OR COALESCE(NEW."buyerEmail",       '') <> COALESCE(OLD."buyerEmail",       '')
    OR COALESCE(NEW."buyerPhone",       '') <> COALESCE(OLD."buyerPhone",       '')
    OR COALESCE(NEW."buyerVatId",       '') <> COALESCE(OLD."buyerVatId",       '')
    OR COALESCE(NEW."buyerFreeText",    '') <> COALESCE(OLD."buyerFreeText",    '')
    OR NEW."documentType"                   <> OLD."documentType"
    OR COALESCE(NEW."invoiceNumber",    '') <> COALESCE(OLD."invoiceNumber",    '')
    OR COALESCE(NEW."snapshotBuyer",    '') <> COALESCE(OLD."snapshotBuyer",    '')
    OR COALESCE(NEW."snapshotSeller",   '') <> COALESCE(OLD."snapshotSeller",   '')
    OR COALESCE(NEW."issueDate",        '') <> COALESCE(OLD."issueDate",        '')
    OR COALESCE(NEW."serviceDateFrom",  '') <> COALESCE(OLD."serviceDateFrom",  '')
    OR COALESCE(NEW."serviceDateTo",    '') <> COALESCE(OLD."serviceDateTo",    '')
    OR COALESCE(NEW."dueDate",          '') <> COALESCE(OLD."dueDate",          '')
    OR NEW."currency"                       <> OLD."currency"
    OR NEW."taxScheme"                      <> OLD."taxScheme"
    OR COALESCE(NEW."introText",        '') <> COALESCE(OLD."introText",        '')
    OR COALESCE(NEW."outroText",        '') <> COALESCE(OLD."outroText",        '')
    OR COALESCE(NEW."purchaseOrderRef", '') <> COALESCE(OLD."purchaseOrderRef", '')
    OR COALESCE(NEW."templateId",       '') <> COALESCE(OLD."templateId",       '')
    OR NEW."netTotalCents"                  <> OLD."netTotalCents"
    OR NEW."taxTotalCents"                  <> OLD."taxTotalCents"
    OR NEW."grossTotalCents"                <> OLD."grossTotalCents"
    OR COALESCE(NEW."createdById",      '') <> COALESCE(OLD."createdById",      '')
))
EXECUTE FUNCTION "fn_Invoice_immutable_after_issue"();

CREATE FUNCTION "fn_Invoice_no_delete_after_issue"() RETURNS trigger
LANGUAGE plpgsql AS $$
BEGIN
    RAISE EXCEPTION 'Festgeschriebener Beleg wird storniert, nicht geloescht (FA-RECH-11)';
END;
$$;

CREATE TRIGGER "Invoice_no_delete_after_issue"
BEFORE DELETE ON "Invoice" FOR EACH ROW
WHEN (OLD."status" <> 'DRAFT')
EXECUTE FUNCTION "fn_Invoice_no_delete_after_issue"();

-- Positionen: Der Status steht am **Beleg**, also braucht die Bedingung eine
-- Unterabfrage und muss in den Rumpf.
CREATE FUNCTION "fn_InvoiceLine_immutable_after_issue"() RETURNS trigger
LANGUAGE plpgsql AS $$
BEGIN
    IF (SELECT "status" FROM "Invoice" WHERE "id" = OLD."invoiceId") <> 'DRAFT' THEN
        RAISE EXCEPTION 'Positionen eines festgeschriebenen Belegs sind unveraenderlich (FA-NUM-08)';
    END IF;
    RETURN NEW;
END;
$$;

CREATE TRIGGER "InvoiceLine_immutable_after_issue"
BEFORE UPDATE ON "InvoiceLine" FOR EACH ROW
EXECUTE FUNCTION "fn_InvoiceLine_immutable_after_issue"();

CREATE FUNCTION "fn_InvoiceLine_no_delete_after_issue"() RETURNS trigger
LANGUAGE plpgsql AS $$
BEGIN
    IF (SELECT "status" FROM "Invoice" WHERE "id" = OLD."invoiceId") <> 'DRAFT' THEN
        RAISE EXCEPTION 'Positionen eines festgeschriebenen Belegs sind unveraenderlich (FA-NUM-08)';
    END IF;
    RETURN OLD;
END;
$$;

CREATE TRIGGER "InvoiceLine_no_delete_after_issue"
BEFORE DELETE ON "InvoiceLine" FOR EACH ROW
EXECUTE FUNCTION "fn_InvoiceLine_no_delete_after_issue"();

-- ─── Aussperrsicherung (FA-ROLE-04) ─────────────────────────────────────────
--
-- Je Unternehmen haelt immer mindestens ein nicht gesperrtes Konto
-- `organization.administer`.
--
-- Zwei Einschraenkungen, beide durch Fehlschlaege gelernt und hier erhalten:
-- Der Trigger haengt an genau den Spalten, die den Zustand herstellen koennen
-- (nicht an jeder Kontoaenderung — sonst feuerte er beim Zuruecksetzen des
-- Fehlversuchszaehlers), und er greift nur, wenn die betroffene Zeile selbst
-- eine aktive Rechteverwaltung war.

CREATE FUNCTION "fn_Organization_keeps_administrator_user"() RETURNS trigger
LANGUAGE plpgsql AS $$
BEGIN
    IF OLD."disabledAt" IS NULL
       AND EXISTS (SELECT 1 FROM "RolePermission"
                   WHERE "roleId" = OLD."roleId"
                     AND "permissionKey" = 'organization.administer')
       AND (SELECT COUNT(*) FROM "User" u
            JOIN "RolePermission" rp ON rp."roleId" = u."roleId"
            WHERE u."organizationId" = OLD."organizationId"
              AND u."disabledAt" IS NULL
              AND rp."permissionKey" = 'organization.administer') = 0
       -- Beim Loeschen zusaetzlich: Nur solange es die Organisation noch gibt.
       -- Sonst scheiterte das kaskadierende Loeschen an seiner eigenen Ordnung.
       AND (TG_OP <> 'DELETE'
            OR EXISTS (SELECT 1 FROM "Organization" WHERE "id" = OLD."organizationId"))
    THEN
        RAISE EXCEPTION 'Letztes Konto mit Rechteverwaltung (FA-ROLE-04)';
    END IF;
    RETURN NULL;
END;
$$;

CREATE TRIGGER "Organization_keeps_administrator_on_user_update"
AFTER UPDATE OF "roleId", "disabledAt", "organizationId" ON "User" FOR EACH ROW
EXECUTE FUNCTION "fn_Organization_keeps_administrator_user"();

CREATE TRIGGER "Organization_keeps_administrator_on_user_delete"
AFTER DELETE ON "User" FOR EACH ROW
EXECUTE FUNCTION "fn_Organization_keeps_administrator_user"();

CREATE FUNCTION "fn_Organization_keeps_administrator_permission"() RETURNS trigger
LANGUAGE plpgsql AS $$
BEGIN
    IF OLD."permissionKey" = 'organization.administer'
       AND (SELECT COUNT(*) FROM "User" u
            JOIN "RolePermission" rp ON rp."roleId" = u."roleId"
            WHERE u."organizationId" = OLD."organizationId"
              AND u."disabledAt" IS NULL
              AND rp."permissionKey" = 'organization.administer') = 0
       AND EXISTS (SELECT 1 FROM "User"
                   WHERE "roleId" = OLD."roleId" AND "disabledAt" IS NULL)
       AND EXISTS (SELECT 1 FROM "Organization" WHERE "id" = OLD."organizationId")
    THEN
        RAISE EXCEPTION 'Letztes Konto mit Rechteverwaltung (FA-ROLE-04)';
    END IF;
    RETURN NULL;
END;
$$;

CREATE TRIGGER "Organization_keeps_administrator_on_permission_delete"
AFTER DELETE ON "RolePermission" FOR EACH ROW
EXECUTE FUNCTION "fn_Organization_keeps_administrator_permission"();
