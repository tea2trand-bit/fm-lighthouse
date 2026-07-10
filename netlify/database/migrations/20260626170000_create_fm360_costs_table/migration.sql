CREATE TABLE IF NOT EXISTS "fm360_costs" (
  "id" text PRIMARY KEY NOT NULL,
  "parent" text NOT NULL,
  "category" text NOT NULL,
  "title" text DEFAULT '' NOT NULL,
  "amount_chf" text DEFAULT '' NOT NULL,
  "status" text DEFAULT 'Geplant' NOT NULL,
  "year" text DEFAULT '' NOT NULL,
  "source" text DEFAULT 'Manuell' NOT NULL,
  "note" text DEFAULT '' NOT NULL,
  "data" jsonb DEFAULT '{}'::jsonb NOT NULL,
  "created_at" timestamp DEFAULT now() NOT NULL,
  "updated_at" timestamp DEFAULT now() NOT NULL
);
