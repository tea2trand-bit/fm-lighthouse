ALTER TABLE "fm360_tickets"
  ADD COLUMN IF NOT EXISTS "execution_by" text NOT NULL DEFAULT '',
  ADD COLUMN IF NOT EXISTS "cost_chf" text NOT NULL DEFAULT '',
  ADD COLUMN IF NOT EXISTS "invoice_received" text NOT NULL DEFAULT '',
  ADD COLUMN IF NOT EXISTS "delivery_note_received" text NOT NULL DEFAULT '';
