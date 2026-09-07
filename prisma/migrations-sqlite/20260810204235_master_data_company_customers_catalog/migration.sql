-- CreateTable
CREATE TABLE "CompanyProfile" (
    -- Singleton: Die CHECK-Bedingung verhindert einen zweiten Firmendatensatz
    -- auf Datenbankebene. Prisma allein leistet das nicht — `@default(1)`
    -- setzt nur einen Vorgabewert und schliesst id = 2 nicht aus.
    "id" INTEGER NOT NULL PRIMARY KEY DEFAULT 1 CHECK ("id" = 1),
    "legalName" TEXT NOT NULL,
    "addressLine1" TEXT NOT NULL,
    "addressLine2" TEXT,
    "postalCode" TEXT NOT NULL,
    "city" TEXT NOT NULL,
    "countryCode" TEXT NOT NULL DEFAULT 'DE',
    "email" TEXT,
    "phone" TEXT,
    "website" TEXT,
    "taxNumber" TEXT,
    "vatId" TEXT,
    "isSmallBusiness" BOOLEAN NOT NULL DEFAULT false,
    "registerCourt" TEXT,
    "registerNumber" TEXT,
    "managingDirector" TEXT,
    "bankAccountHolder" TEXT,
    "iban" TEXT,
    "bic" TEXT,
    "bankName" TEXT,
    "logoAssetId" TEXT,
    "defaultPaymentTerms" INTEGER NOT NULL DEFAULT 14,
    "defaultTaxRate" INTEGER NOT NULL DEFAULT 19,
    "defaultCurrency" TEXT NOT NULL DEFAULT 'EUR',
    "footerText" TEXT,
    "invoiceNumberFormat" TEXT NOT NULL DEFAULT 'RE-{YYYY}-{SEQ:4}',
    "updatedAt" DATETIME NOT NULL,
    CONSTRAINT "CompanyProfile_logoAssetId_fkey" FOREIGN KEY ("logoAssetId") REFERENCES "Asset" ("id") ON DELETE SET NULL ON UPDATE CASCADE
);

-- CreateTable
CREATE TABLE "Customer" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "customerNumber" TEXT NOT NULL,
    "companyName" TEXT,
    "contactName" TEXT,
    "addressLine1" TEXT NOT NULL,
    "addressLine2" TEXT,
    "postalCode" TEXT NOT NULL,
    "city" TEXT NOT NULL,
    "countryCode" TEXT NOT NULL DEFAULT 'DE',
    "email" TEXT,
    "phone" TEXT,
    "vatId" TEXT,
    "buyerReference" TEXT,
    "paymentTerms" INTEGER,
    "notes" TEXT,
    "isArchived" BOOLEAN NOT NULL DEFAULT false,
    "createdAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" DATETIME NOT NULL
);

-- CreateTable
CREATE TABLE "CatalogItem" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "name" TEXT NOT NULL,
    "description" TEXT,
    "unitPriceCents" INTEGER NOT NULL,
    "unitCode" TEXT NOT NULL DEFAULT 'C62',
    "taxRate" INTEGER NOT NULL DEFAULT 19,
    "isArchived" BOOLEAN NOT NULL DEFAULT false,
    "createdAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" DATETIME NOT NULL
);

-- CreateTable
CREATE TABLE "Asset" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "fileName" TEXT NOT NULL,
    "mimeType" TEXT NOT NULL,
    "byteSize" INTEGER NOT NULL,
    "sha256" TEXT NOT NULL,
    "storagePath" TEXT NOT NULL,
    "createdAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP
);

-- CreateTable
CREATE TABLE "NumberSequence" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "scope" TEXT NOT NULL,
    "lastValue" INTEGER NOT NULL DEFAULT 0
);

-- CreateIndex
CREATE UNIQUE INDEX "Customer_customerNumber_key" ON "Customer"("customerNumber");

-- CreateIndex
CREATE INDEX "Customer_isArchived_idx" ON "Customer"("isArchived");

-- CreateIndex
CREATE INDEX "Customer_customerNumber_idx" ON "Customer"("customerNumber");

-- CreateIndex
CREATE INDEX "CatalogItem_isArchived_idx" ON "CatalogItem"("isArchived");

-- CreateIndex
CREATE UNIQUE INDEX "NumberSequence_scope_key" ON "NumberSequence"("scope");
