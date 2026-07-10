DO $$
DECLARE
  roland_id text;
  admin_id text;
BEGIN
  SELECT id INTO roland_id
  FROM "fm360_employees"
  WHERE lower(trim("login_name")) = 'worker'
     OR lower(trim("name")) = 'roland'
  ORDER BY
    CASE WHEN lower(trim("login_name")) = 'worker' THEN 0 ELSE 1 END,
    "created_at",
    "id"
  LIMIT 1;

  IF roland_id IS NULL THEN
    roland_id := 'emp-roland';
    INSERT INTO "fm360_employees" (
      "id", "name", "email", "login_name", "login_enabled", "password_hash",
      "role", "skills", "availability", "piket_eligible", "updated_at"
    )
    VALUES (
      roland_id, 'Roland', '', 'worker', true,
      'sha256:87eba76e7f3164534045ba922e7770fb58bbd14ad732bbf5ba6f11cc56989e6e',
      'Field Technician', 'Mitarbeiter / Field Technician', 'Anwesend', false, now()
    )
    ON CONFLICT ("id") DO NOTHING;
  END IF;

  UPDATE "fm360_shifts"
  SET "employee_id" = roland_id
  WHERE "employee_id" IN (
    SELECT id FROM "fm360_employees"
    WHERE id <> roland_id AND lower(trim("name")) = 'roland'
  );

  UPDATE "fm360_shifts"
  SET "managed_by_employee_id" = roland_id
  WHERE "managed_by_employee_id" IN (
    SELECT id FROM "fm360_employees"
    WHERE id <> roland_id AND lower(trim("name")) = 'roland'
  );

  UPDATE "fm360_piket"
  SET "employee_id" = roland_id
  WHERE "employee_id" IN (
    SELECT id FROM "fm360_employees"
    WHERE id <> roland_id AND lower(trim("name")) = 'roland'
  );

  UPDATE "fm360_piket"
  SET "managed_by_employee_id" = roland_id
  WHERE "managed_by_employee_id" IN (
    SELECT id FROM "fm360_employees"
    WHERE id <> roland_id AND lower(trim("name")) = 'roland'
  );

  UPDATE "fm360_tickets"
  SET "assigned_employee_id" = roland_id
  WHERE "assigned_employee_id" IN (
    SELECT id FROM "fm360_employees"
    WHERE id <> roland_id AND lower(trim("name")) = 'roland'
  );

  UPDATE "fm360_tickets"
  SET "assigned_by_employee_id" = roland_id
  WHERE "assigned_by_employee_id" IN (
    SELECT id FROM "fm360_employees"
    WHERE id <> roland_id AND lower(trim("name")) = 'roland'
  );

  UPDATE "fm360_task_assignments"
  SET "employee_id" = roland_id
  WHERE "employee_id" IN (
    SELECT id FROM "fm360_employees"
    WHERE id <> roland_id AND lower(trim("name")) = 'roland'
  );

  UPDATE "fm360_task_assignments"
  SET "assigned_by_employee_id" = roland_id
  WHERE "assigned_by_employee_id" IN (
    SELECT id FROM "fm360_employees"
    WHERE id <> roland_id AND lower(trim("name")) = 'roland'
  );

  UPDATE "fm360_vacation_entries"
  SET "employee_id" = roland_id
  WHERE "employee_id" IN (
    SELECT id FROM "fm360_employees"
    WHERE id <> roland_id AND lower(trim("name")) = 'roland'
  );

  UPDATE "fm360_vacation_entries"
  SET "managed_by_employee_id" = roland_id
  WHERE "managed_by_employee_id" IN (
    SELECT id FROM "fm360_employees"
    WHERE id <> roland_id AND lower(trim("name")) = 'roland'
  );

  UPDATE "fm360_notifications"
  SET "employee_id" = roland_id
  WHERE "employee_id" IN (
    SELECT id FROM "fm360_employees"
    WHERE id <> roland_id AND lower(trim("name")) = 'roland'
  );

  DELETE FROM "fm360_employee_roles"
  WHERE "employee_id" IN (
    SELECT id FROM "fm360_employees"
    WHERE id <> roland_id AND lower(trim("name")) = 'roland'
  );

  DELETE FROM "fm360_employees"
  WHERE id <> roland_id
    AND lower(trim("name")) = 'roland';

  UPDATE "fm360_employees"
  SET
    "login_name" = 'worker',
    "login_enabled" = true,
    "password_hash" = CASE
      WHEN coalesce("password_hash", '') = '' THEN 'sha256:87eba76e7f3164534045ba922e7770fb58bbd14ad732bbf5ba6f11cc56989e6e'
      ELSE "password_hash"
    END,
    "updated_at" = now()
  WHERE "id" = roland_id;

  SELECT id INTO admin_id
  FROM "fm360_employees"
  WHERE lower(trim("login_name")) = 'admin'
     OR lower(trim("name")) = 'admin'
  ORDER BY
    CASE WHEN lower(trim("login_name")) = 'admin' THEN 0 ELSE 1 END,
    "created_at",
    "id"
  LIMIT 1;

  IF admin_id IS NULL THEN
    admin_id := 'emp-admin';
    INSERT INTO "fm360_employees" (
      "id", "name", "email", "login_name", "login_enabled", "password_hash",
      "role", "skills", "availability", "piket_eligible", "updated_at"
    )
    VALUES (
      admin_id, 'Admin', '', 'admin', true,
      'sha256:8c6976e5b5410415bde908bd4dee15dfb167a9c873fc4bb8a81f6f2ab448a918',
      'Admin / Chef', 'FM360 Administration', 'Anwesend', false, now()
    )
    ON CONFLICT ("id") DO NOTHING;
  END IF;

  UPDATE "fm360_employees"
  SET
    "name" = CASE WHEN trim("name") = '' THEN 'Admin' ELSE "name" END,
    "login_name" = 'admin',
    "login_enabled" = true,
    "password_hash" = CASE
      WHEN coalesce("password_hash", '') = '' THEN 'sha256:8c6976e5b5410415bde908bd4dee15dfb167a9c873fc4bb8a81f6f2ab448a918'
      ELSE "password_hash"
    END,
    "role" = CASE WHEN trim("role") = '' THEN 'Admin / Chef' ELSE "role" END,
    "updated_at" = now()
  WHERE "id" = admin_id;
END $$;
