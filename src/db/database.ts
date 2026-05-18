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
    this.connection.exec(SCHEMA_SQL);
  }
}
