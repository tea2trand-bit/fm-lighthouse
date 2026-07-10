CREATE TABLE "fm360_photos" (
	"id" text PRIMARY KEY,
	"parent" text NOT NULL,
	"description" text DEFAULT '' NOT NULL,
	"blob_key" text NOT NULL,
	"content_type" text DEFAULT 'image/jpeg' NOT NULL,
	"ticket_id" text,
	"created_at" timestamp DEFAULT now() NOT NULL,
	"updated_at" timestamp DEFAULT now() NOT NULL
);
