import type Database from "better-sqlite3";
import type {ItemTransferEvent, QueueRecord, QueueStatus} from "../types.js";

export class QueueRepo {
  constructor(private readonly db: Database.Database) {}

  enqueue(
    sinkKey: string,
    event: ItemTransferEvent,
    payload: unknown,
    now: number,
  ): void {
    this.db
      .prepare(
        `INSERT INTO push_queue(
          sink_key,
          notification_id,
          tx_hash,
          log_index,
          sub_index,
          block_number,
          event_name,
          payload_json,
          status,
          attempt_count,
          next_attempt_at,
          last_error,
          created_at,
          updated_at,
          delivered_at
        ) VALUES(?, ?, ?, ?, ?, ?, ?, ?, 'pending', 0, ?, NULL, ?, ?, NULL)
        ON CONFLICT(sink_key, notification_id) DO NOTHING`,
      )
      .run(
        sinkKey,
        event.notificationId,
        event.txHash,
        event.logIndex,
        event.subIndex,
        event.blockNumber,
        event.eventName,
        JSON.stringify(payload),
        now,
        now,
        now,
      );
  }

  claimReady(limit: number, now: number): QueueRecord[] {
    const rows = this.db
      .prepare(
        `SELECT
          id,
          sink_key as sinkKey,
          notification_id as notificationId,
          payload_json as payloadJson,
          status,
          attempt_count as attemptCount,
          next_attempt_at as nextAttemptAt,
          last_error as lastError,
          created_at as createdAt,
          updated_at as updatedAt
        FROM push_queue
        WHERE status IN ('pending', 'failed') AND next_attempt_at <= ?
        ORDER BY block_number ASC, log_index ASC, sub_index ASC, created_at ASC
        LIMIT ?`,
      )
      .all(now, limit) as QueueRecord[];

    const markInflight = this.db.prepare(
      "UPDATE push_queue SET status = 'inflight', updated_at = ? WHERE id = ?",
    );
    const tx = this.db.transaction((records: QueueRecord[]) => {
      for (const record of records) {
        markInflight.run(now, record.id);
      }
    });
    tx(rows);

    return rows.map((record) => ({...record, status: "inflight"}));
  }

  markSucceeded(id: number): void {
    this.db
      .prepare(
        `UPDATE push_queue
         SET status = 'done', delivered_at = ?, updated_at = ?, last_error = NULL
         WHERE id = ?`,
      )
      .run(Date.now(), Date.now(), id);
  }

  markFailed(
    id: number,
    status: QueueStatus,
    nextAttemptAt: number,
    lastError: string,
  ): void {
    this.db
      .prepare(
        `UPDATE push_queue
         SET status = ?, attempt_count = attempt_count + 1, next_attempt_at = ?, last_error = ?, updated_at = ?
         WHERE id = ?`,
      )
      .run(status, nextAttemptAt, lastError, Date.now(), id);
  }

  markDead(id: number, lastError: string): void {
    this.db
      .prepare(
        `UPDATE push_queue
         SET status = 'dead', attempt_count = attempt_count + 1, last_error = ?, updated_at = ?
         WHERE id = ?`,
      )
      .run(lastError, Date.now(), id);
  }

  countByStatus(status: QueueStatus): number {
    const row = this.db
      .prepare("SELECT COUNT(*) AS count FROM push_queue WHERE status = ?")
      .get(status) as {count: number};
    return row.count;
  }
}
