CREATE TABLE "fm360_emergency_contacts" (
	"id" text PRIMARY KEY,
	"name" text NOT NULL,
	"phone" text DEFAULT '' NOT NULL,
	"description" text DEFAULT '' NOT NULL,
	"created_at" timestamp DEFAULT now() NOT NULL,
	"updated_at" timestamp DEFAULT now() NOT NULL
);
