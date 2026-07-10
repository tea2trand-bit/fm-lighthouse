CREATE TABLE IF NOT EXISTS "fm360_floor_records" (
  "id" text PRIMARY KEY NOT NULL,
  "floor_id" text NOT NULL REFERENCES "fm360_nodes"("id") ON DELETE CASCADE,
  "section" text NOT NULL,
  "title" text NOT NULL,
  "status" text NOT NULL DEFAULT '',
  "note" text NOT NULL DEFAULT '',
  "data" jsonb NOT NULL DEFAULT '{}'::jsonb,
  "created_at" timestamp DEFAULT now() NOT NULL,
  "updated_at" timestamp DEFAULT now() NOT NULL
);

CREATE INDEX IF NOT EXISTS "fm360_floor_records_floor_section_idx" ON "fm360_floor_records" ("floor_id", "section");
