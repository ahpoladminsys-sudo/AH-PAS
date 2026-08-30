import { integer, jsonb, pgTable, text, timestamp } from "drizzle-orm/pg-core";

export const sheetSyncConfigTable = pgTable("sheet_sync_config", {
  id: integer("id").primaryKey(),
  spreadsheetId: text("spreadsheet_id"),
  spreadsheetUrl: text("spreadsheet_url"),
  title: text("title"),
  lastSyncedAt: text("last_synced_at"),
  writeVerifiedAt: text("write_verified_at"),
});

export type SheetSyncConfig = typeof sheetSyncConfigTable.$inferSelect;

/** The single server-authoritative Operations & Licensing workspace. */
export const licensingStateTable = pgTable("licensing_state", {
  id: integer("id").primaryKey(),
  state: jsonb("state").notNull(),
  version: integer("version").notNull().default(1),
  createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
  updatedAt: timestamp("updated_at", { withTimezone: true }).notNull().defaultNow(),
  updatedBy: text("updated_by").notNull(),
});

export type LicensingState = typeof licensingStateTable.$inferSelect;