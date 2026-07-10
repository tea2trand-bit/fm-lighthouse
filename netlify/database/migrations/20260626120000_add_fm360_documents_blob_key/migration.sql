ALTER TABLE "fm360_documents" ADD COLUMN IF NOT EXISTS "blob_key" text;
ALTER TABLE "fm360_documents" ADD COLUMN IF NOT EXISTS "content_type" text NOT NULL DEFAULT 'application/octet-stream';
ALTER TABLE "fm360_documents" ADD COLUMN IF NOT EXISTS "file_name" text NOT NULL DEFAULT '';
