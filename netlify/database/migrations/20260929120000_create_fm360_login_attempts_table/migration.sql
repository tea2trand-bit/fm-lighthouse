CREATE TABLE IF NOT EXISTS "fm360_login_attempts" (
  "key" text PRIMARY KEY NOT NULL,
  "failures" integer DEFAULT 0 NOT NULL,
  "window_start" timestamp DEFAULT now() NOT NULL
);
