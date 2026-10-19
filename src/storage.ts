// SPDX-License-Identifier: GPL-3.0-or-later
// Copyright (C) 2026 Iris (@iriss-dev) <iriss.smith08@proton.me>

import { createRequire } from 'node:module';
import type { LogEntry, QueueStorage } from './types.js';

const require = createRequire(import.meta.url);

export class MemoryQueue implements QueueStorage {
  private buffer: LogEntry[] = [];

  push(entry: LogEntry): void {
    this.buffer.push(entry);
  }

  popBatch(limit: number): LogEntry[] {
    if (this.buffer.length === 0) return [];
    return this.buffer.splice(0, limit);
  }

  requeue(entries: LogEntry[]): void {
    if (entries.length === 0) return;
    this.buffer.unshift(...entries);
  }

  size(): number {
    return this.buffer.length;
  }

  close(): void {
    this.buffer.length = 0;
  }
}

interface DatabaseSyncInstance {
  exec(sql: string): void;
  prepare(sql: string): {
    run(...params: unknown[]): unknown;
    all(...params: unknown[]): Array<Record<string, unknown>>;
    get(...params: unknown[]): Record<string, unknown> | undefined;
  };
  close(): void;
}

export class SqliteQueue implements QueueStorage {
  private db: DatabaseSyncInstance;
  private insertStmt: ReturnType<DatabaseSyncInstance['prepare']>;
  private countStmt: ReturnType<DatabaseSyncInstance['prepare']>;

  constructor(filePath: string = './.draincord.db') {
    let DatabaseSyncClass: new (path: string) => DatabaseSyncInstance;

    try {
      // Dynamic import/require so environments without node:sqlite can still load MemoryQueue
      // eslint-disable-next-line @typescript-eslint/no-require-imports
      const sqlite = require('node:sqlite');
      DatabaseSyncClass = sqlite.DatabaseSync;
    } catch {
      throw new Error(
        'SqliteQueue requires Node.js v22.5.0+ with native node:sqlite support. ' +
        'Use MemoryQueue or upgrade your Node runtime.'
      );
    }

    this.db = new DatabaseSyncClass(filePath);
    this.db.exec('PRAGMA journal_mode = WAL;');
    this.db.exec(`
      CREATE TABLE IF NOT EXISTS draincord_queue (
        id INTEGER PRIMARY KEY AUTOINCREMENT,
        payload TEXT NOT NULL,
        created_at INTEGER NOT NULL
      );
      CREATE INDEX IF NOT EXISTS idx_draincord_created ON draincord_queue(created_at);
    `);

    this.insertStmt = this.db.prepare(
      'INSERT INTO draincord_queue (payload, created_at) VALUES (?, ?)'
    );
    this.countStmt = this.db.prepare(
      'SELECT COUNT(*) as total FROM draincord_queue'
    );
  }

  push(entry: LogEntry): void {
    this.insertStmt.run(JSON.stringify(entry), Date.now());
  }

  popBatch(limit: number): LogEntry[] {
    const fetchStmt = this.db.prepare(
      'SELECT id, payload FROM draincord_queue ORDER BY id ASC LIMIT ?'
    );
    const rows = fetchStmt.all(limit) as Array<{ id: number; payload: string }>;

    if (!rows || rows.length === 0) {
      return [];
    }

    const ids = rows.map((r) => r.id);
    const placeholders = ids.map(() => '?').join(',');
    const deleteStmt = this.db.prepare(
      `DELETE FROM draincord_queue WHERE id IN (${placeholders})`
    );
    deleteStmt.run(...ids);

    const results: LogEntry[] = [];
    for (const row of rows) {
      try {
        const parsed = JSON.parse(row.payload) as LogEntry;
        parsed.id = row.id;
        results.push(parsed);
      } catch {
        // Drop unparseable corrupt records silently to prevent queue stall
      }
    }

    return results;
  }

  requeue(entries: LogEntry[]): void {
    if (entries.length === 0) return;
    this.db.exec('BEGIN TRANSACTION;');
    try {
      for (const entry of entries) {
        this.insertStmt.run(JSON.stringify(entry), entry.timestamp || Date.now());
      }
      this.db.exec('COMMIT;');
    } catch (err) {
      this.db.exec('ROLLBACK;');
      throw err;
    }
  }

  size(): number {
    const row = this.countStmt.get() as { total: number } | undefined;
    return row ? Number(row.total) : 0;
  }

  close(): void {
    this.db.close();
  }
}
