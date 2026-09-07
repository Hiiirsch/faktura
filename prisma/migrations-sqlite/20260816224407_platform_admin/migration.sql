-- Betreiberkonten und ihre Sitzungen (M8, FA-ADM-01).
--
-- Getrennt von `User`/`Session`, damit „die Verwaltung sieht keine
-- Geschaeftsdaten" eine Eigenschaft des Typsystems ist und keine Zusage: Eine
-- Adminsitzung fuehrt keinen OrganizationContext, und jede Repository-Funktion
-- verlangt einen.
--
-- Hinweis zum Neuaufbau weiter unten: Prisma baut `PendingLogin` neu auf, weil
-- die Spalte `adminUserId` hinzukommt und `userId` optional wird. Auf dieser
-- Tabelle liegen **keine** Trigger — geprueft in
-- tests/integration/database-triggers.test.ts, das nach dieser Migration
-- denselben Bestand von 16 Triggern erwartet wie davor.

-- CreateTable
CREATE TABLE "AdminUser" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "email" TEXT NOT NULL,
    "name" TEXT,
    "passwordHash" TEXT NOT NULL,
    "totpSecret" TEXT,
    "totpEnabled" BOOLEAN NOT NULL DEFAULT false,
    "failedLogins" INTEGER NOT NULL DEFAULT 0,
    "lockedUntil" DATETIME,
    "disabledAt" DATETIME,
    "lastLoginAt" DATETIME,
    "createdAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" DATETIME NOT NULL
);

-- CreateTable
CREATE TABLE "AdminSession" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "adminUserId" TEXT NOT NULL,
    "tokenHash" TEXT NOT NULL,
    "userAgent" TEXT,
    "ipAddress" TEXT,
    "expiresAt" DATETIME NOT NULL,
    "createdAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "lastSeenAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT "AdminSession_adminUserId_fkey" FOREIGN KEY ("adminUserId") REFERENCES "AdminUser" ("id") ON DELETE CASCADE ON UPDATE CASCADE
);

-- RedefineTables
PRAGMA defer_foreign_keys=ON;
PRAGMA foreign_keys=OFF;
CREATE TABLE "new_PendingLogin" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "userId" TEXT,
    "adminUserId" TEXT,
    "tokenHash" TEXT NOT NULL,
    "ipAddress" TEXT,
    "expiresAt" DATETIME NOT NULL,
    "createdAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT "PendingLogin_userId_fkey" FOREIGN KEY ("userId") REFERENCES "User" ("id") ON DELETE CASCADE ON UPDATE CASCADE,
    CONSTRAINT "PendingLogin_adminUserId_fkey" FOREIGN KEY ("adminUserId") REFERENCES "AdminUser" ("id") ON DELETE CASCADE ON UPDATE CASCADE,
    -- Genau eines von beiden. Ein Nachweis, der zu keinem oder zu zwei Konten
    -- gehoert, waere ein Zustand, den keine Abfrage sinnvoll aufloest.
    CONSTRAINT "PendingLogin_exactly_one_account" CHECK (
        ("userId" IS NOT NULL AND "adminUserId" IS NULL)
     OR ("userId" IS NULL AND "adminUserId" IS NOT NULL)
    )
);
INSERT INTO "new_PendingLogin" ("createdAt", "expiresAt", "id", "ipAddress", "tokenHash", "userId") SELECT "createdAt", "expiresAt", "id", "ipAddress", "tokenHash", "userId" FROM "PendingLogin";
DROP TABLE "PendingLogin";
ALTER TABLE "new_PendingLogin" RENAME TO "PendingLogin";
CREATE UNIQUE INDEX "PendingLogin_tokenHash_key" ON "PendingLogin"("tokenHash");
CREATE INDEX "PendingLogin_userId_idx" ON "PendingLogin"("userId");
CREATE INDEX "PendingLogin_expiresAt_idx" ON "PendingLogin"("expiresAt");
CREATE INDEX "PendingLogin_adminUserId_idx" ON "PendingLogin"("adminUserId");
PRAGMA foreign_keys=ON;
PRAGMA defer_foreign_keys=OFF;

-- CreateIndex
CREATE UNIQUE INDEX "AdminUser_email_key" ON "AdminUser"("email");

-- CreateIndex
CREATE UNIQUE INDEX "AdminSession_tokenHash_key" ON "AdminSession"("tokenHash");

-- CreateIndex
CREATE INDEX "AdminSession_adminUserId_idx" ON "AdminSession"("adminUserId");

-- CreateIndex
CREATE INDEX "AdminSession_expiresAt_idx" ON "AdminSession"("expiresAt");
