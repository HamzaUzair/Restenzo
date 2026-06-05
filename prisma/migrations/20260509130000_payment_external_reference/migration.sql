-- Payment reference for Card / Online cashier payments.
--
-- The existing `reference` column already stores the system-assigned Bill
-- ID (`BILL-YYYYMMDD-NNNNNN`) so we add a separate, nullable column for
-- the cashier-entered reference that comes off the card terminal or
-- online wallet (POS invoice number, transaction ID, etc.). Cash
-- payments leave it NULL; legacy paid rows stay valid because the column
-- is nullable.

ALTER TABLE "Payment" ADD COLUMN IF NOT EXISTS "external_reference" TEXT;
