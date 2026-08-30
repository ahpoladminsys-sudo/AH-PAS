CREATE TABLE IF NOT EXISTS "sheet_sync_config" (
"id" integer PRIMARY KEY NOT NULL,
"spreadsheet_id" text,
"spreadsheet_url" text,
"title" text,
"last_synced_at" text
);
--> statement-breakpoint
ALTER TABLE "sheet_sync_config" ADD COLUMN IF NOT EXISTS "write_verified_at" text;
