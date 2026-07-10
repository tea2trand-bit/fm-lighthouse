ALTER TABLE "fm360_piket" ADD COLUMN "intervention_duration" text DEFAULT '' NOT NULL;--> statement-breakpoint
ALTER TABLE "fm360_piket" ADD COLUMN "intervention_cause" text DEFAULT '' NOT NULL;--> statement-breakpoint
ALTER TABLE "fm360_piket" ADD COLUMN "intervention_measure" text DEFAULT '' NOT NULL;--> statement-breakpoint
ALTER TABLE "fm360_piket" ADD COLUMN "intervention_status" text DEFAULT 'offen' NOT NULL;