-- Art der Planung: einmaliger Arbeitsauftrag oder wiederkehrende Inspektion / Kontrolle.
ALTER TABLE "fm360_tickets" ADD COLUMN IF NOT EXISTS "planning_kind" text DEFAULT 'work_order' NOT NULL;
-- Bestehende Aufträge mit Intervall sind Inspektionen, alle anderen Arbeitsaufträge.
UPDATE "fm360_tickets" SET "planning_kind" = 'inspection' WHERE "recurrence" IS NOT NULL AND "planning_kind" <> 'inspection';
ALTER TABLE "fm360_tickets" DROP CONSTRAINT IF EXISTS "fm360_tickets_planning_kind_check";
ALTER TABLE "fm360_tickets" ADD CONSTRAINT "fm360_tickets_planning_kind_check" CHECK ("planning_kind" IN ('work_order', 'inspection'));
