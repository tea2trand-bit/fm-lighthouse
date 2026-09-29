-- Arbeitsrapporte bleiben am ausgeführten Auftrag, nicht an der nächsten Inspektion.
ALTER TABLE "fm360_tickets" ADD COLUMN IF NOT EXISTS "work_logs" jsonb NOT NULL DEFAULT '[]'::jsonb;
