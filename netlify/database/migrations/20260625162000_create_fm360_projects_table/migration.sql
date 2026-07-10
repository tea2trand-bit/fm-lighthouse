CREATE TABLE IF NOT EXISTS "fm360_projects" (
  "id" text PRIMARY KEY NOT NULL,
  "kind" text NOT NULL,
  "title" text DEFAULT '' NOT NULL,
  "category" text DEFAULT '' NOT NULL,
  "location" text DEFAULT '' NOT NULL,
  "responsible" text DEFAULT '' NOT NULL,
  "status" text DEFAULT '' NOT NULL,
  "data" jsonb DEFAULT '{}'::jsonb NOT NULL,
  "created_at" timestamp DEFAULT now() NOT NULL,
  "updated_at" timestamp DEFAULT now() NOT NULL
);
