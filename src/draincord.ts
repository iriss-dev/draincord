// SPDX-License-Identifier: GPL-3.0-or-later
// Copyright (C) 2026 Iris (@iriss-dev) <iriss.smith08@proton.me>

import type {
  DiscordEmbed,
  DraincordOptions,
  LogEntry,
  LogLevel,
  QueueStorage
} from './types.js';
import { MemoryQueue, SqliteQueue } from './storage.js';
import { chunkEntries } from './formatter.js';
import { WebhookDispatcher, type FetchFunction } from './dispatcher.js';

export class Draincord {
  private queue: QueueStorage;
  private dispatcher: WebhookDispatcher;
  private flushTimer: ReturnType<typeof setInterval> | null = null;
  private isFlushing = false;
  private closed = false;
  private maxBatchSize: number;
  private maxCharsPerBatch: number;
  private onError?: (err: Error, context?: { batchSize?: number }) => void;

  constructor(options: DraincordOptions & { fetchFn?: FetchFunction }) {
    if (!options.webhookUrl) {
      throw new Error('Draincord: webhookUrl is required.');
    }

    this.maxBatchSize = Math.min(options.maxBatchSize || 10, 10);
    this.maxCharsPerBatch = options.maxCharsPerBatch || 5000;
    this.onError = options.onError;

    if (!options.storage || options.storage === 'memory') {
      this.queue = new MemoryQueue();
    } else if (options.storage === 'sqlite') {
      this.queue = new SqliteQueue(options.sqlitePath);
    } else {
      this.queue = options.storage;
    }

    this.dispatcher = new WebhookDispatcher({
      webhookUrl: options.webhookUrl,
      fallbackWebhookUrl: options.fallbackWebhookUrl,
      username: options.username,
      avatarUrl: options.avatarUrl,
      fetchFn: options.fetchFn
    });

    const interval = options.flushIntervalMs || 2000;
    this.flushTimer = setInterval(() => {
      this.flush().catch((err) => {
        if (this.onError) this.onError(err);
      });
    }, interval);

    // Don't keep the process alive solely for the flush timer
    if (this.flushTimer.unref) {
      this.flushTimer.unref();
    }

    if (options.autoExitHook !== false) {
      this.setupExitHandlers();
    }
  }

  private setupExitHandlers(): void {
    const handleExit = async () => {
      if (this.closed) return;
      await this.close();
    };

    process.once('beforeExit', handleExit);
    process.once('SIGINT', handleExit);
    process.once('SIGTERM', handleExit);
  }

  push(entryOrEmbed: Partial<LogEntry> | DiscordEmbed): void {
    if (this.closed) return;

    let entry: LogEntry;

    // Check if passed a direct DiscordEmbed
    if ('title' in entryOrEmbed || 'fields' in entryOrEmbed || 'color' in entryOrEmbed) {
      entry = {
        level: 'info',
        tag: 'CUSTOM',
        message: '',
        timestamp: Date.now(),
        embed: entryOrEmbed as DiscordEmbed
      };
    } else {
      const p = entryOrEmbed as Partial<LogEntry>;
      entry = {
        level: p.level || 'info',
        tag: p.tag || 'APP',
        message: p.message || '',
        timestamp: p.timestamp || Date.now(),
        meta: p.meta || null,
        embed: p.embed
      };
    }

    this.queue.push(entry);
  }

  log(
    level: LogLevel,
    tag: string,
    message: string,
    meta?: Record<string, unknown>
  ): void {
    this.push({
      level,
      tag,
      message,
      meta,
      timestamp: Date.now()
    });
  }

  debug(tag: string, message: string, meta?: Record<string, unknown>): void {
    this.log('debug', tag, message, meta);
  }

  info(tag: string, message: string, meta?: Record<string, unknown>): void {
    this.log('info', tag, message, meta);
  }

  warn(tag: string, message: string, meta?: Record<string, unknown>): void {
    this.log('warn', tag, message, meta);
  }

  error(
    tag: string,
    message: string,
    errorOrMeta?: Error | Record<string, unknown>
  ): void {
    let meta: Record<string, unknown> | undefined;

    if (errorOrMeta instanceof Error) {
      meta = {
        name: errorOrMeta.name,
        errorMessage: errorOrMeta.message,
        stack: errorOrMeta.stack
      };
    } else if (errorOrMeta) {
      meta = errorOrMeta;
    }

    this.log('error', tag, message, meta);
  }

  fatal(
    tag: string,
    message: string,
    errorOrMeta?: Error | Record<string, unknown>
  ): void {
    let meta: Record<string, unknown> | undefined;

    if (errorOrMeta instanceof Error) {
      meta = {
        name: errorOrMeta.name,
        errorMessage: errorOrMeta.message,
        stack: errorOrMeta.stack
      };
    } else if (errorOrMeta) {
      meta = errorOrMeta;
    }

    this.log('fatal', tag, message, meta);
  }

  async flush(): Promise<void> {
    if (this.isFlushing || this.closed) return;
    this.isFlushing = true;

    try {
      while (true) {
        if (this.dispatcher.isRateLimited()) {
          break;
        }

        const entries = await this.queue.popBatch(this.maxBatchSize * 3);
        if (!entries || entries.length === 0) {
          break;
        }

        const chunks = chunkEntries(
          entries,
          this.maxBatchSize,
          this.maxCharsPerBatch
        );

        for (let i = 0; i < chunks.length; i++) {
          const chunk = chunks[i];
          const result = await this.dispatcher.sendEmbeds(chunk.embeds);

          if (!result.ok) {
            // Requeue remaining items from current chunk and subsequent unprocessed chunks
            const remaining: LogEntry[] = [];
            remaining.push(...chunk.entries);

            for (let j = i + 1; j < chunks.length; j++) {
              remaining.push(...chunks[j].entries);
            }

            await this.queue.requeue(remaining);

            if (result.error && this.onError) {
              this.onError(result.error, { batchSize: remaining.length });
            }
            return;
          }
        }
      }
    } finally {
      this.isFlushing = false;
    }
  }

  async size(): Promise<number> {
    return this.queue.size();
  }

  async close(): Promise<void> {
    if (this.closed) return;
    this.closed = true;

    if (this.flushTimer) {
      clearInterval(this.flushTimer);
      this.flushTimer = null;
    }

    // Final drain attempt
    this.closed = false; // temporarily allow flush during shutdown
    await this.flush().catch(() => {});
    this.closed = true;

    await this.queue.close();
  }
}
