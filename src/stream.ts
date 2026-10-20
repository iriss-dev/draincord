// SPDX-License-Identifier: GPL-3.0-or-later
// Copyright (C) 2026 Iris (@iriss-dev) <iriss.smith08@proton.me>

import { Writable } from 'node:stream';
import type { Draincord } from './draincord.js';
import type { LogLevel } from './types.js';

export interface StreamAdapterOptions {
  tag?: string;
}

// Maps standard numeric syslog/Pino levels to Draincord LogLevel
function pinoLevelToLogLevel(level: number | string): LogLevel {
  if (typeof level === 'string') {
    const l = level.toLowerCase();
    if (l === 'error') return 'error';
    if (l === 'warn') return 'warn';
    if (l === 'debug' || l === 'trace') return 'debug';
    if (l === 'fatal') return 'fatal';
    return 'info';
  }

  if (level >= 60) return 'fatal';
  if (level >= 50) return 'error';
  if (level >= 40) return 'warn';
  if (level >= 30) return 'info';
  return 'debug';
}

export function createDraincordStream(
  drain: Draincord,
  options?: StreamAdapterOptions
): Writable {
  const defaultTag = options?.tag || 'APP';

  return new Writable({
    write(chunk: Buffer | string, _encoding, callback) {
      try {
        const raw = chunk.toString().trim();
        if (!raw) {
          callback();
          return;
        }

        try {
          const parsed = JSON.parse(raw);
          const level = pinoLevelToLogLevel(parsed.level ?? 30);
          const msg = parsed.msg || parsed.message || '';
          const tag = parsed.name || parsed.tag || defaultTag;

          // Strip internal fields from metadata display
          const { level: _l, msg: _m, message: _me, time: _t, tag: _tg, name: _n, ...meta } = parsed;

          drain.log(level, tag, msg, Object.keys(meta).length > 0 ? meta : undefined);
        } catch {
          // Non-JSON plaintext logs
          drain.info(defaultTag, raw);
        }

        callback();
      } catch (err) {
        callback(err instanceof Error ? err : new Error(String(err)));
      }
    }
  });
}
