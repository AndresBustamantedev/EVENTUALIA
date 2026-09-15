-- AlterTable: añadir campo isAlbaran a Invoice
ALTER TABLE "invoices" ADD COLUMN "is_albaran" BOOLEAN NOT NULL DEFAULT FALSE;

-- Índice para filtrar rápido albaranes vs facturas
CREATE INDEX "invoices_is_albaran_idx" ON "invoices"("is_albaran");
