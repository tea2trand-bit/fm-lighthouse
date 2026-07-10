CREATE TABLE "fm360_brandschutz" (
	"id" text PRIMARY KEY,
	"system_type" text NOT NULL,
	"name" text NOT NULL,
	"location" text DEFAULT '' NOT NULL,
	"inspection_interval" text DEFAULT '' NOT NULL,
	"last_inspection" text DEFAULT '' NOT NULL,
	"next_inspection" text DEFAULT '' NOT NULL,
	"certificate" text DEFAULT '' NOT NULL,
	"defects" text DEFAULT '' NOT NULL,
	"created_at" timestamp DEFAULT now() NOT NULL,
	"updated_at" timestamp DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "fm360_employees" (
	"id" text PRIMARY KEY,
	"name" text NOT NULL,
	"role" text DEFAULT '' NOT NULL,
	"skills" text DEFAULT '' NOT NULL,
	"availability" text DEFAULT 'Verfügbar' NOT NULL,
	"created_at" timestamp DEFAULT now() NOT NULL,
	"updated_at" timestamp DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "fm360_piket" (
	"id" text PRIMARY KEY,
	"date" text NOT NULL,
	"employee_name" text NOT NULL,
	"shift_time" text DEFAULT '' NOT NULL,
	"contacts" text DEFAULT '' NOT NULL,
	"interventions" text DEFAULT '' NOT NULL,
	"response_time" text DEFAULT '' NOT NULL,
	"escalation" text DEFAULT '' NOT NULL,
	"status" text DEFAULT 'Geplant' NOT NULL,
	"created_at" timestamp DEFAULT now() NOT NULL,
	"updated_at" timestamp DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "fm360_security" (
	"id" text PRIMARY KEY,
	"system_type" text NOT NULL,
	"name" text NOT NULL,
	"location" text DEFAULT '' NOT NULL,
	"status" text DEFAULT 'Aktiv' NOT NULL,
	"alarm_history" text DEFAULT '' NOT NULL,
	"incidents" text DEFAULT '' NOT NULL,
	"created_at" timestamp DEFAULT now() NOT NULL,
	"updated_at" timestamp DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "fm360_shifts" (
	"id" text PRIMARY KEY,
	"employee_id" text NOT NULL,
	"date" text NOT NULL,
	"shift_type" text NOT NULL,
	"task_assignment" text DEFAULT '' NOT NULL,
	"workload" text DEFAULT 'Normal' NOT NULL,
	"created_at" timestamp DEFAULT now() NOT NULL,
	"updated_at" timestamp DEFAULT now() NOT NULL
);
