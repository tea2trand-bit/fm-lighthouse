-- Wiederkehrende Arbeitsaufträge: Intervall/Erinnerung (recurrence), Serie, Nachfolger und Materialbedarf.
ALTER TABLE "fm360_tickets" ADD COLUMN IF NOT EXISTS "recurrence" jsonb;
ALTER TABLE "fm360_tickets" ADD COLUMN IF NOT EXISTS "series_id" text;
ALTER TABLE "fm360_tickets" ADD COLUMN IF NOT EXISTS "previous_ticket_id" text;
ALTER TABLE "fm360_tickets" ADD COLUMN IF NOT EXISTS "next_ticket_id" text;
ALTER TABLE "fm360_tickets" ADD COLUMN IF NOT EXISTS "completed_at" timestamp;
ALTER TABLE "fm360_tickets" ADD COLUMN IF NOT EXISTS "material_needed" text DEFAULT '' NOT NULL;
ALTER TABLE "fm360_tickets" ADD COLUMN IF NOT EXISTS "completion_note" text DEFAULT '' NOT NULL;
-- Pro abgeschlossenem Auftrag höchstens ein Folgeauftrag, auch bei gleichzeitigem Speichern.
CREATE UNIQUE INDEX IF NOT EXISTS "fm360_tickets_previous_ticket_id_unique" ON "fm360_tickets" ("previous_ticket_id") WHERE "previous_ticket_id" IS NOT NULL;
CREATE INDEX IF NOT EXISTS "fm360_tickets_series_id_idx" ON "fm360_tickets" ("series_id");
-- Neue Benachrichtigungsart für Erinnerungen an fällige Aufträge (Glocke in der App).
ALTER TABLE "fm360_notifications" DROP CONSTRAINT IF EXISTS "fm360_notifications_task_event_check";
ALTER TABLE "fm360_notifications" ADD CONSTRAINT "fm360_notifications_task_event_check"
  CHECK ("event_type" IN ('new_ticket', 'ticket_assigned', 'priority_changed', 'task_updated', 'maintenance_reminder'));
