// SPDX-License-Identifier: GPL-3.0-or-later
// Copyright (C) 2026 Iris (@iriss-dev) <iriss.smith08@proton.me>

export type LogLevel = 'debug' | 'info' | 'warn' | 'error' | 'fatal';

export interface EmbedField {
  name: string;
  value: string;
  inline?: boolean;
}

export interface EmbedFooter {
  text: string;
  icon_url?: string;
}

export interface EmbedAuthor {
  name: string;
  url?: string;
  icon_url?: string;
}

export interface DiscordEmbed {
  title?: string;
  description?: string;
  url?: string;
  timestamp?: string;
  color?: number;
  footer?: EmbedFooter;
  image?: { url: string };
  thumbnail?: { url: string };
  author?: EmbedAuthor;
  fields?: EmbedField[];
}

export interface WebhookPayload {
  content?: string;
  username?: string;
  avatar_url?: string;
  tts?: boolean;
  embeds?: DiscordEmbed[];
}

export interface LogEntry {
  id?: number | string;
  level: LogLevel;
  tag: string;
  message: string;
  timestamp: number;
  meta?: Record<string, unknown> | null;
  embed?: DiscordEmbed;
}

export interface QueueStorage {
  push(entry: LogEntry): void | Promise<void>;
  popBatch(limit: number): LogEntry[] | Promise<LogEntry[]>;
  requeue(entries: LogEntry[]): void | Promise<void>;
  size(): number | Promise<number>;
  close(): void | Promise<void>;
}

export interface DraincordOptions {
  webhookUrl: string;
  fallbackWebhookUrl?: string;
  username?: string;
  avatarUrl?: string;
  flushIntervalMs?: number;
  maxBatchSize?: number;
  maxCharsPerBatch?: number;
  storage?: 'memory' | 'sqlite' | QueueStorage;
  sqlitePath?: string;
  autoExitHook?: boolean;
  onError?: (err: Error, context?: { batchSize?: number }) => void;
}
