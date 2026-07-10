CREATE TABLE "fm360_documents" (
	"id" text PRIMARY KEY,
	"parent" text NOT NULL,
	"type" text NOT NULL,
	"title" text NOT NULL,
	"folder" text DEFAULT '' NOT NULL,
	"tags" text DEFAULT '' NOT NULL,
	"note" text DEFAULT '' NOT NULL,
	"created_at" timestamp DEFAULT now() NOT NULL,
	"updated_at" timestamp DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "fm360_nodes" (
	"id" text PRIMARY KEY,
	"parent" text,
	"type" text NOT NULL,
	"name" text NOT NULL,
	"code" text DEFAULT '' NOT NULL,
	"notes" text DEFAULT '' NOT NULL,
	"anlage" jsonb,
	"sort_order" integer DEFAULT 0 NOT NULL,
	"created_at" timestamp DEFAULT now() NOT NULL,
	"updated_at" timestamp DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "fm360_templates" (
	"id" text PRIMARY KEY,
	"type" text NOT NULL,
	"name" text NOT NULL,
	"text" text DEFAULT '' NOT NULL,
	"created_at" timestamp DEFAULT now() NOT NULL,
	"updated_at" timestamp DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "fm360_tickets" (
	"id" text PRIMARY KEY,
	"parent" text NOT NULL,
	"type" text NOT NULL,
	"status" text NOT NULL,
	"prio" text NOT NULL,
	"title" text NOT NULL,
	"resp" text DEFAULT '' NOT NULL,
	"due" text DEFAULT '' NOT NULL,
	"text" text DEFAULT '' NOT NULL,
	"created" text DEFAULT '' NOT NULL,
	"created_at" timestamp DEFAULT now() NOT NULL,
	"updated_at" timestamp DEFAULT now() NOT NULL
);
