import { promises as fs } from "node:fs";
import * as path from "node:path";
import { FileMigrationProvider, Migrator } from "kysely/migration";
import { db } from "./connection.js";

const migrationFolder = new URL("./migrations", import.meta.url)
  .pathname;

const migrator = new Migrator({
  db,
  provider: new FileMigrationProvider({
    fs,
    path,
    migrationFolder,
  }),
});

const direction = process.argv[2];

async function run() {
  if (direction === "down") {
    console.log("Running one migration down...");
    const { error, results } = await migrator.migrateDown();
    results?.forEach((r) => {
      if (r.status === "Success")
        console.log(`  ✓ Rolled back: ${r.migrationName}`);
      if (r.status === "Error")
        console.error(`  ✗ Failed: ${r.migrationName}`);
    });
    if (error) {
      console.error("Rollback error:", error);
      process.exit(1);
    }
  } else {
    console.log("Running migrations to latest...");
    const { error, results } = await migrator.migrateToLatest();
    results?.forEach((r) => {
      if (r.status === "Success")
        console.log(`  ✓ Migrated: ${r.migrationName}`);
      if (r.status === "Error")
        console.error(`  ✗ Failed: ${r.migrationName}`);
    });
    if (error) {
      console.error("Migration error:", error);
      process.exit(1);
    }
    console.log("All migrations complete.");
  }

  await db.destroy();
}

run();
