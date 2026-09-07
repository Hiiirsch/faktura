-- Die erste Organisation und ihre Inhaberrolle (M17)
--
-- **Warum das in einer Migration steht und nicht in einem Seed-Skript.** Unter
-- SQLite entstand beides ebenso beim Migrieren — die Organisation in
-- `20260811113615_organization_context`, die Rolle in
-- `20260817071321_roles_and_permissions`. Eine frisch aufgesetzte Anlage hatte
-- damit von der ersten Sekunde an einen Mandanten, auf den sich Betriebsskripte
-- (`npm run seed`, `npm run user:create`) ohne Abfrage beziehen konnten.
--
-- Die Baseline daneben ist reines Prisma-Schema und kennt keine Zeilen. Ohne
-- diese Migration stünde eine frische PostgreSQL-Anlage ohne Organisation da,
-- und dieselben Skripte scheiterten an einem Fremdschlüssel — eine stille
-- Verhaltensänderung, die niemand angeordnet hat.
--
-- **Feste Kennungen statt cuid**, wie in der SQLite-Fassung: Betriebsskripte
-- und Wiederherstellungen sollen sie benennen können, ohne sie zu suchen.
--
-- Die Schlüsselliste ist eine **Momentaufnahme** des Katalogs zum Zeitpunkt
-- dieser Migration und soll das bleiben. Der Katalog selbst lebt in
-- `src/domain/policy/can.ts`; wer dort einen Schlüssel ergänzt, trägt ihn per
-- eigener Migration nach — so wie M15 es mit `invoice.remind` getan hat.

INSERT INTO "Organization" ("id", "name", "createdAt")
VALUES ('org_default', 'Meine Organisation', CURRENT_TIMESTAMP)
ON CONFLICT ("id") DO NOTHING;

INSERT INTO "Role" ("id", "organizationId", "name", "description", "createdAt", "updatedAt")
VALUES (
    'role_owner_org_default',
    'org_default',
    'Inhaber',
    'Beim Aufsetzen angelegt — alle Berechtigungen.',
    CURRENT_TIMESTAMP,
    CURRENT_TIMESTAMP
)
ON CONFLICT ("id") DO NOTHING;

INSERT INTO "RolePermission" ("id", "organizationId", "roleId", "permissionKey")
SELECT gen_random_uuid()::text, 'org_default', 'role_owner_org_default', k."key"
FROM (VALUES
    ('catalogItem.archive'),
    ('catalogItem.create'),
    ('catalogItem.read'),
    ('catalogItem.update'),
    ('companyProfile.read'),
    ('companyProfile.update'),
    ('customer.archive'),
    ('customer.create'),
    ('customer.read'),
    ('customer.update'),
    ('export.run'),
    ('invoice.cancel'),
    ('invoice.create'),
    ('invoice.delete'),
    ('invoice.duplicate'),
    ('invoice.issue'),
    ('invoice.read'),
    ('invoice.recordPayment'),
    ('invoice.remind'),
    ('invoice.update'),
    ('numbering.read'),
    ('numbering.update'),
    ('organization.administer'),
    ('security.read'),
    ('security.update'),
    ('template.create'),
    ('template.delete'),
    ('template.read'),
    ('template.update')
) AS k("key")
ON CONFLICT DO NOTHING;
