CREATE TABLE IF NOT EXISTS "fm360_room_records" (
  "id" text PRIMARY KEY NOT NULL,
  "room_id" text NOT NULL REFERENCES "fm360_nodes"("id") ON DELETE CASCADE,
  "section" text NOT NULL,
  "title" text NOT NULL,
  "status" text NOT NULL DEFAULT '',
  "note" text NOT NULL DEFAULT '',
  "data" jsonb NOT NULL DEFAULT '{}'::jsonb,
  "created_at" timestamp DEFAULT now() NOT NULL,
  "updated_at" timestamp DEFAULT now() NOT NULL
);

CREATE INDEX IF NOT EXISTS "fm360_room_records_room_section_idx" ON "fm360_room_records" ("room_id", "section");
