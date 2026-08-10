/*
  Warnings:

  - You are about to drop the column `taxRate` on the `CatalogItem` table. All the data in the column will be lost.
  - You are about to drop the column `defaultTaxRate` on the `CompanyProfile` table. All the data in the column will be lost.

*/
-- CreateTable
CREATE TABLE "Invoice" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "documentType" TEXT NOT NULL DEFAULT 'INVOICE',
    "invoiceNumber" TEXT,
    "status" TEXT NOT NULL DEFAULT 'DRAFT',
    "customerId" TEXT NOT NULL,
    "snapshotBuyer" TEXT,
    "snapshotSeller" TEXT,
    "issueDate" TEXT,
    "serviceDateFrom" TEXT,
    "serviceDateTo" TEXT,
    "dueDate" TEXT,
    "currency" TEXT NOT NULL DEFAULT 'EUR',
    "taxScheme" TEXT NOT NULL DEFAULT 'STANDARD',
    "introText" TEXT,
    "outroText" TEXT,
    "purchaseOrderRef" TEXT,
    "precedingInvoiceId" TEXT,
    "templateId" TEXT,
    "netTotalCents" INTEGER NOT NULL DEFAULT 0,
    "taxTotalCents" INTEGER NOT NULL DEFAULT 0,
    "grossTotalCents" INTEGER NOT NULL DEFAULT 0,
    "paidTotalCents" INTEGER NOT NULL DEFAULT 0,
    "issuedAt" DATETIME,
    "cancelledAt" DATETIME,
    "createdAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" DATETIME NOT NULL,
    CONSTRAINT "Invoice_customerId_fkey" FOREIGN KEY ("customerId") REFERENCES "Customer" ("id") ON DELETE RESTRICT ON UPDATE CASCADE,
    CONSTRAINT "Invoice_precedingInvoiceId_fkey" FOREIGN KEY ("precedingInvoiceId") REFERENCES "Invoice" ("id") ON DELETE SET NULL ON UPDATE CASCADE
);

-- CreateTable
CREATE TABLE "InvoiceLine" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "invoiceId" TEXT NOT NULL,
    "position" INTEGER NOT NULL,
    "name" TEXT NOT NULL,
    "description" TEXT,
    "quantityScaled" INTEGER NOT NULL,
    "unitCode" TEXT NOT NULL DEFAULT 'C62',
    "unitPriceCents" INTEGER NOT NULL,
    "taxRateBasisPoints" INTEGER NOT NULL,
    "taxCategory" TEXT NOT NULL DEFAULT 'S',
    "discountBasisPoints" INTEGER NOT NULL DEFAULT 0,
    "lineNetCents" INTEGER NOT NULL,
    CONSTRAINT "InvoiceLine_invoiceId_fkey" FOREIGN KEY ("invoiceId") REFERENCES "Invoice" ("id") ON DELETE CASCADE ON UPDATE CASCADE
);

-- CreateTable
CREATE TABLE "Payment" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "invoiceId" TEXT NOT NULL,
    "amountCents" INTEGER NOT NULL,
    "paidAt" TEXT NOT NULL,
    "method" TEXT,
    "note" TEXT,
    "createdAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT "Payment_invoiceId_fkey" FOREIGN KEY ("invoiceId") REFERENCES "Invoice" ("id") ON DELETE CASCADE ON UPDATE CASCADE
);

-- RedefineTables
PRAGMA defer_foreign_keys=ON;
PRAGMA foreign_keys=OFF;
CREATE TABLE "new_CatalogItem" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "name" TEXT NOT NULL,
    "description" TEXT,
    "unitPriceCents" INTEGER NOT NULL,
    "unitCode" TEXT NOT NULL DEFAULT 'C62',
    "taxRateBasisPoints" INTEGER NOT NULL DEFAULT 1900,
    "isArchived" BOOLEAN NOT NULL DEFAULT false,
    "createdAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" DATETIME NOT NULL
);
INSERT INTO "new_CatalogItem" ("createdAt", "description", "id", "isArchived", "name", "unitCode", "unitPriceCents", "updatedAt") SELECT "createdAt", "description", "id", "isArchived", "name", "unitCode", "unitPriceCents", "updatedAt" FROM "CatalogItem";
DROP TABLE "CatalogItem";
ALTER TABLE "new_CatalogItem" RENAME TO "CatalogItem";
CREATE INDEX "CatalogItem_isArchived_idx" ON "CatalogItem"("isArchived");
CREATE TABLE "new_CompanyProfile" (
    -- Singleton: Die CHECK-Bedingung verhindert einen zweiten Firmendatensatz
    -- auf Datenbankebene. Sie muss bei jedem Neuaufbau der Tabelle erneut
    -- gesetzt werden — SQLite kennt kein ALTER TABLE ADD CONSTRAINT, und
    -- Prisma baut die Tabelle bei Spaltenaenderungen komplett neu auf.
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
    "defaultTaxRateBasisPoints" INTEGER NOT NULL DEFAULT 1900,
    "defaultCurrency" TEXT NOT NULL DEFAULT 'EUR',
    "footerText" TEXT,
    "invoiceNumberFormat" TEXT NOT NULL DEFAULT 'RE-{YYYY}-{SEQ:4}',
    "updatedAt" DATETIME NOT NULL,
    CONSTRAINT "CompanyProfile_logoAssetId_fkey" FOREIGN KEY ("logoAssetId") REFERENCES "Asset" ("id") ON DELETE SET NULL ON UPDATE CASCADE
);
INSERT INTO "new_CompanyProfile" ("addressLine1", "addressLine2", "bankAccountHolder", "bankName", "bic", "city", "countryCode", "defaultCurrency", "defaultPaymentTerms", "email", "footerText", "iban", "id", "invoiceNumberFormat", "isSmallBusiness", "legalName", "logoAssetId", "managingDirector", "phone", "postalCode", "registerCourt", "registerNumber", "taxNumber", "updatedAt", "vatId", "website") SELECT "addressLine1", "addressLine2", "bankAccountHolder", "bankName", "bic", "city", "countryCode", "defaultCurrency", "defaultPaymentTerms", "email", "footerText", "iban", "id", "invoiceNumberFormat", "isSmallBusiness", "legalName", "logoAssetId", "managingDirector", "phone", "postalCode", "registerCourt", "registerNumber", "taxNumber", "updatedAt", "vatId", "website" FROM "CompanyProfile";
DROP TABLE "CompanyProfile";
ALTER TABLE "new_CompanyProfile" RENAME TO "CompanyProfile";
PRAGMA foreign_keys=ON;
PRAGMA defer_foreign_keys=OFF;

-- CreateIndex
CREATE UNIQUE INDEX "Invoice_invoiceNumber_key" ON "Invoice"("invoiceNumber");

-- CreateIndex
CREATE INDEX "Invoice_status_dueDate_idx" ON "Invoice"("status", "dueDate");

-- CreateIndex
CREATE INDEX "Invoice_customerId_idx" ON "Invoice"("customerId");

-- CreateIndex
CREATE INDEX "Invoice_issueDate_idx" ON "Invoice"("issueDate");

-- CreateIndex
CREATE INDEX "Invoice_documentType_status_idx" ON "Invoice"("documentType", "status");

-- CreateIndex
CREATE INDEX "InvoiceLine_invoiceId_idx" ON "InvoiceLine"("invoiceId");

-- CreateIndex
CREATE UNIQUE INDEX "InvoiceLine_invoiceId_position_key" ON "InvoiceLine"("invoiceId", "position");

-- CreateIndex
CREATE INDEX "Payment_invoiceId_idx" ON "Payment"("invoiceId");
