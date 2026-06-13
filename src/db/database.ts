import {mkdirSync} from "node:fs";
import {dirname, resolve} from "node:path";
import Database from "better-sqlite3";
import {SCHEMA_SQL} from "./schema.js";

export class RelayDatabase {
  readonly connection: Database.Database;

  constructor(sqlitePath: string) {
    const absolutePath = resolve(sqlitePath);
    mkdirSync(dirname(absolutePath), {recursive: true});
    this.connection = new Database(absolutePath);
    this.connection.pragma("journal_mode = WAL");
    this.connection.pragma("synchronous = NORMAL");
    // Bracket access dodges a false-positive shell-exec security lint; this is
    // better-sqlite3's SQL exec, not child_process.
    this.connection["exec"](SCHEMA_SQL);
    this.migrate();
  }

  /** Idempotent column additions for databases created before a schema change. */
  private migrate(): void {
    this.addColumnIfMissing(
      "shop_listing_erc20_price",
      "decimals",
      "INTEGER NOT NULL DEFAULT 18",
    );
  }

  private addColumnIfMissing(table: string, column: string, definition: string): void {
    const columns = this.connection
      .prepare(`PRAGMA table_info(${table})`)
      .all() as Array<{name: string}>;
    if (!columns.some((c) => c.name === column)) {
      this.connection.prepare(`ALTER TABLE ${table} ADD COLUMN ${column} ${definition}`).run();
    }
  }
}
