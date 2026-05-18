import type Database from "better-sqlite3";

export class MetaRepo {
  constructor(private readonly db: Database.Database) {}

  getNumber(key: string): number | null {
    const row = this.db
      .prepare("SELECT value FROM meta WHERE key = ?")
      .get(key) as {value: string} | undefined;
    return row ? Number(row.value) : null;
  }

  setNumber(key: string, value: number): void {
    this.db
      .prepare(
        "INSERT INTO meta(key, value) VALUES(?, ?) ON CONFLICT(key) DO UPDATE SET value = excluded.value",
      )
      .run(key, String(value));
  }
}
