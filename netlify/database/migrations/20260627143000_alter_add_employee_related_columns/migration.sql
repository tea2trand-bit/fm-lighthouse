ALTER TABLE "fm360_employees"
  ADD COLUMN IF NOT EXISTS "email" text NOT NULL DEFAULT '',
  ADD COLUMN IF NOT EXISTS "login_enabled" boolean NOT NULL DEFAULT false,
  ADD COLUMN IF NOT EXISTS "password_hash" text NOT NULL DEFAULT '';

ALTER TABLE "fm360_tickets"
  ADD COLUMN IF NOT EXISTS "assigned_employee_id" text,
  ADD COLUMN IF NOT EXISTS "assigned_by_employee_id" text,
  ADD COLUMN IF NOT EXISTS "assigned_at" timestamp;

ALTER TABLE "fm360_shifts"
  ADD COLUMN IF NOT EXISTS "managed_by_employee_id" text;

ALTER TABLE "fm360_piket"
  ADD COLUMN IF NOT EXISTS "employee_id" text,
  ADD COLUMN IF NOT EXISTS "managed_by_employee_id" text;

CREATE TABLE IF NOT EXISTS "fm360_roles" (
  "id" text PRIMARY KEY NOT NULL,
  "name" text NOT NULL,
  "description" text DEFAULT '' NOT NULL,
  "created_at" timestamp DEFAULT now() NOT NULL,
  "updated_at" timestamp DEFAULT now() NOT NULL
);

CREATE TABLE IF NOT EXISTS "fm360_permissions" (
  "id" text PRIMARY KEY NOT NULL,
  "module" text NOT NULL,
  "action" text NOT NULL,
  "description" text DEFAULT '' NOT NULL,
  "created_at" timestamp DEFAULT now() NOT NULL,
  "updated_at" timestamp DEFAULT now() NOT NULL
);

CREATE TABLE IF NOT EXISTS "fm360_role_permissions" (
  "role_id" text NOT NULL REFERENCES "fm360_roles"("id") ON DELETE CASCADE,
  "permission_id" text NOT NULL REFERENCES "fm360_permissions"("id") ON DELETE CASCADE,
  "created_at" timestamp DEFAULT now() NOT NULL,
  PRIMARY KEY ("role_id", "permission_id")
);

CREATE TABLE IF NOT EXISTS "fm360_employee_roles" (
  "employee_id" text NOT NULL REFERENCES "fm360_employees"("id") ON DELETE CASCADE,
  "role_id" text NOT NULL REFERENCES "fm360_roles"("id") ON DELETE CASCADE,
  "assigned_by_employee_id" text REFERENCES "fm360_employees"("id") ON DELETE SET NULL,
  "created_at" timestamp DEFAULT now() NOT NULL,
  PRIMARY KEY ("employee_id", "role_id")
);

CREATE TABLE IF NOT EXISTS "fm360_task_assignments" (
  "id" text PRIMARY KEY NOT NULL,
  "ticket_id" text NOT NULL REFERENCES "fm360_tickets"("id") ON DELETE CASCADE,
  "employee_id" text NOT NULL REFERENCES "fm360_employees"("id") ON DELETE CASCADE,
  "assigned_by_employee_id" text REFERENCES "fm360_employees"("id") ON DELETE SET NULL,
  "status" text DEFAULT 'new' NOT NULL,
  "due_date" text DEFAULT '' NOT NULL,
  "note" text DEFAULT '' NOT NULL,
  "assigned_at" timestamp DEFAULT now() NOT NULL,
  "completed_at" timestamp,
  "created_at" timestamp DEFAULT now() NOT NULL,
  "updated_at" timestamp DEFAULT now() NOT NULL
);

CREATE TABLE IF NOT EXISTS "fm360_vacation_entries" (
  "id" text PRIMARY KEY NOT NULL,
  "employee_id" text NOT NULL REFERENCES "fm360_employees"("id") ON DELETE CASCADE,
  "managed_by_employee_id" text REFERENCES "fm360_employees"("id") ON DELETE SET NULL,
  "start_date" text NOT NULL,
  "end_date" text NOT NULL,
  "status" text DEFAULT 'requested' NOT NULL,
  "type" text DEFAULT 'vacation' NOT NULL,
  "note" text DEFAULT '' NOT NULL,
  "created_at" timestamp DEFAULT now() NOT NULL,
  "updated_at" timestamp DEFAULT now() NOT NULL
);

CREATE TABLE IF NOT EXISTS "fm360_notifications" (
  "id" text PRIMARY KEY NOT NULL,
  "employee_id" text NOT NULL REFERENCES "fm360_employees"("id") ON DELETE CASCADE,
  "ticket_id" text REFERENCES "fm360_tickets"("id") ON DELETE CASCADE,
  "task_assignment_id" text REFERENCES "fm360_task_assignments"("id") ON DELETE CASCADE,
  "event_type" text NOT NULL,
  "title" text NOT NULL,
  "body" text DEFAULT '' NOT NULL,
  "read_at" timestamp,
  "created_at" timestamp DEFAULT now() NOT NULL,
  CONSTRAINT "fm360_notifications_task_event_check"
    CHECK ("event_type" IN ('new_ticket', 'ticket_assigned', 'priority_changed', 'task_updated'))
);

DO $$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'fm360_tickets_assigned_employee_fk') THEN
    ALTER TABLE "fm360_tickets"
      ADD CONSTRAINT "fm360_tickets_assigned_employee_fk"
      FOREIGN KEY ("assigned_employee_id") REFERENCES "fm360_employees"("id") ON DELETE SET NULL;
  END IF;
  IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'fm360_tickets_assigned_by_employee_fk') THEN
    ALTER TABLE "fm360_tickets"
      ADD CONSTRAINT "fm360_tickets_assigned_by_employee_fk"
      FOREIGN KEY ("assigned_by_employee_id") REFERENCES "fm360_employees"("id") ON DELETE SET NULL;
  END IF;
  IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'fm360_shifts_managed_by_employee_fk') THEN
    ALTER TABLE "fm360_shifts"
      ADD CONSTRAINT "fm360_shifts_managed_by_employee_fk"
      FOREIGN KEY ("managed_by_employee_id") REFERENCES "fm360_employees"("id") ON DELETE SET NULL;
  END IF;
  IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'fm360_piket_employee_fk') THEN
    ALTER TABLE "fm360_piket"
      ADD CONSTRAINT "fm360_piket_employee_fk"
      FOREIGN KEY ("employee_id") REFERENCES "fm360_employees"("id") ON DELETE SET NULL;
  END IF;
  IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'fm360_piket_managed_by_employee_fk') THEN
    ALTER TABLE "fm360_piket"
      ADD CONSTRAINT "fm360_piket_managed_by_employee_fk"
      FOREIGN KEY ("managed_by_employee_id") REFERENCES "fm360_employees"("id") ON DELETE SET NULL;
  END IF;
END $$;

CREATE UNIQUE INDEX IF NOT EXISTS "fm360_employees_email_unique"
  ON "fm360_employees" ("email")
  WHERE "email" <> '';
CREATE UNIQUE INDEX IF NOT EXISTS "fm360_permissions_module_action_unique"
  ON "fm360_permissions" ("module", "action");
CREATE INDEX IF NOT EXISTS "fm360_tickets_assigned_employee_idx"
  ON "fm360_tickets" ("assigned_employee_id");
CREATE INDEX IF NOT EXISTS "fm360_task_assignments_employee_status_idx"
  ON "fm360_task_assignments" ("employee_id", "status");
CREATE INDEX IF NOT EXISTS "fm360_task_assignments_ticket_idx"
  ON "fm360_task_assignments" ("ticket_id");
CREATE INDEX IF NOT EXISTS "fm360_vacation_entries_employee_dates_idx"
  ON "fm360_vacation_entries" ("employee_id", "start_date", "end_date");
CREATE INDEX IF NOT EXISTS "fm360_shifts_employee_date_idx"
  ON "fm360_shifts" ("employee_id", "date");
CREATE INDEX IF NOT EXISTS "fm360_piket_employee_date_idx"
  ON "fm360_piket" ("employee_id", "date");
CREATE INDEX IF NOT EXISTS "fm360_notifications_employee_read_idx"
  ON "fm360_notifications" ("employee_id", "read_at", "created_at");

INSERT INTO "fm360_roles" ("id", "name", "description")
VALUES
  ('role-admin', 'Admin / Chef', 'Kann Mitarbeiter, Rollen, Tickets, Dienstplan, Pikettdienst und Ferien verwalten.'),
  ('role-employee', 'Mitarbeiter', 'Kann eigene Aufgaben, eigenen Dienstplan, eigene Ferien und die Pikettdienst-Rotation sehen.'),
  ('role-field-tech', 'Field Mode Techniker', 'Kann Field Mode verwenden und zugewiesene technische Tickets bearbeiten.')
ON CONFLICT ("id") DO NOTHING;

INSERT INTO "fm360_permissions" ("id", "module", "action", "description")
VALUES
  ('perm-employees-manage', 'employees', 'manage', 'Mitarbeiter anlegen, Login vorbereiten und Stammdaten bearbeiten.'),
  ('perm-roles-manage', 'roles', 'manage', 'Rollen und Berechtigungen vergeben.'),
  ('perm-tickets-assign', 'tickets', 'assign', 'Tickets Mitarbeitern zuweisen.'),
  ('perm-tasks-own-read', 'tasks', 'read_own', 'Nur eigene Aufgaben und Tickets sehen.'),
  ('perm-shifts-manage', 'shifts', 'manage', 'Dienstplan verwalten.'),
  ('perm-shifts-own-read', 'shifts', 'read_own', 'Eigenen Dienstplan sehen.'),
  ('perm-vacations-manage', 'vacations', 'manage', 'Urlaub und Ferien verwalten.'),
  ('perm-vacations-own-read', 'vacations', 'read_own', 'Eigene Ferien sehen.'),
  ('perm-piket-manage', 'piket', 'manage', 'Pikettdienst verwalten.'),
  ('perm-piket-read-rotation', 'piket', 'read_rotation', 'Vollständige Pikettdienst-Rotation sehen.'),
  ('perm-field-use', 'field', 'use', 'QR-Scan, Objektfindung, Servicekontakt, Tickets, Dokumente und Historie nutzen.')
ON CONFLICT ("id") DO NOTHING;

INSERT INTO "fm360_role_permissions" ("role_id", "permission_id")
VALUES
  ('role-admin', 'perm-employees-manage'),
  ('role-admin', 'perm-roles-manage'),
  ('role-admin', 'perm-tickets-assign'),
  ('role-admin', 'perm-shifts-manage'),
  ('role-admin', 'perm-vacations-manage'),
  ('role-admin', 'perm-piket-manage'),
  ('role-admin', 'perm-piket-read-rotation'),
  ('role-admin', 'perm-field-use'),
  ('role-employee', 'perm-tasks-own-read'),
  ('role-employee', 'perm-shifts-own-read'),
  ('role-employee', 'perm-vacations-own-read'),
  ('role-employee', 'perm-piket-read-rotation'),
  ('role-field-tech', 'perm-tasks-own-read'),
  ('role-field-tech', 'perm-field-use'),
  ('role-field-tech', 'perm-piket-read-rotation')
ON CONFLICT ("role_id", "permission_id") DO NOTHING;
