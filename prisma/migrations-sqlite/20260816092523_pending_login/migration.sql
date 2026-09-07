-- CreateTable
CREATE TABLE "PendingLogin" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "userId" TEXT NOT NULL,
    "tokenHash" TEXT NOT NULL,
    "ipAddress" TEXT,
    "expiresAt" DATETIME NOT NULL,
    "createdAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT "PendingLogin_userId_fkey" FOREIGN KEY ("userId") REFERENCES "User" ("id") ON DELETE CASCADE ON UPDATE CASCADE
);

-- CreateIndex
CREATE UNIQUE INDEX "PendingLogin_tokenHash_key" ON "PendingLogin"("tokenHash");

-- CreateIndex
CREATE INDEX "PendingLogin_userId_idx" ON "PendingLogin"("userId");

-- CreateIndex
CREATE INDEX "PendingLogin_expiresAt_idx" ON "PendingLogin"("expiresAt");
