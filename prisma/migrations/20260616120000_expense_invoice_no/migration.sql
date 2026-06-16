-- Invoice / transaction reference for Card and Online expense payments.
-- Cash expenses leave this NULL; legacy rows remain valid.

ALTER TABLE "expenses" ADD COLUMN IF NOT EXISTS "invoice_no" TEXT;
