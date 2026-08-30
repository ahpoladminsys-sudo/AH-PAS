CREATE TABLE IF NOT EXISTS "licensing_state" (
  "id" integer PRIMARY KEY NOT NULL,
  "state" jsonb NOT NULL,
  "version" integer DEFAULT 1 NOT NULL,
  "created_at" timestamp with time zone DEFAULT now() NOT NULL,
  "updated_at" timestamp with time zone DEFAULT now() NOT NULL,
  "updated_by" text NOT NULL
);