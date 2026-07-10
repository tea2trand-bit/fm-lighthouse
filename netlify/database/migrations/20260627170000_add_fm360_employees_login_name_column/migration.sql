ALTER TABLE "fm360_employees"
ADD COLUMN IF NOT EXISTS "login_name" text NOT NULL DEFAULT '';

CREATE UNIQUE INDEX IF NOT EXISTS "fm360_employees_login_name_unique"
ON "fm360_employees" ("login_name")
WHERE "login_name" <> '';
