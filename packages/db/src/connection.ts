import { Kysely } from "kysely";
import { NeonDialect } from "kysely-neon";
import { neon } from "@neondatabase/serverless";
import type { Database } from "./types.js";

export let db: Kysely<Database> = null as any;

export function initDb(databaseUrl: string) {
  if (db) return;
  db = new Kysely<Database>({
    dialect: new NeonDialect({ neon: neon(databaseUrl) }),
  });
}

export { sql } from "kysely";
