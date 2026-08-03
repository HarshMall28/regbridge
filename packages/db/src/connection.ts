import { Kysely } from "kysely";
import { NeonDialect } from "kysely-neon";
import { neon } from "@neondatabase/serverless";
import type { Database } from "./types.js";

let dbInstance: Kysely<Database> | null = null;

export function getDb(connectionString?: string): Kysely<Database> {
  if (dbInstance) return dbInstance;

  const url = connectionString ?? process.env?.DATABASE_URL;
  if (!url) {
    throw new Error("DATABASE_URL environment variable is not set");
  }

  dbInstance = new Kysely<Database>({
    dialect: new NeonDialect({
      neon: neon(url),
    }),
  });

  return dbInstance;
}

// Default export for convenience in dev
export const db = getDb();

export { sql } from "kysely";
