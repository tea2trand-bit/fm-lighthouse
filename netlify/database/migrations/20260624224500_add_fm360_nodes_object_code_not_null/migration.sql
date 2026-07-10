ALTER TABLE "fm360_nodes" ADD COLUMN "object_code" text DEFAULT '' NOT NULL;
--> statement-breakpoint
CREATE UNIQUE INDEX "fm360_nodes_object_code_unique" ON "fm360_nodes" ("object_code") WHERE "object_code" <> '';
