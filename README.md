<div align="center">
  <img src="./assets/banner.png" alt="draincord banner" width="100%" />

  # draincord

  [![npm version](https://img.shields.io/npm/v/draincord.svg?style=flat-square)](https://www.npmjs.com/package/draincord)
  [![CI](https://github.com/iriss-dev/draincord/actions/workflows/ci.yml/badge.svg)](https://github.com/iriss-dev/draincord/actions)
  [![License: GPL v3](https://img.shields.io/badge/License-GPLv3-blue.svg?style=flat-square)](https://www.gnu.org/licenses/gpl-3.0)
  [![Node](https://img.shields.io/badge/node-%3E%3D18.0.0-brightgreen.svg?style=flat-square)](https://nodejs.org)
</div>

Zero-dependency Discord webhook log drain with automatic batching, rate-limit backoff, and optional persistent SQLite spooling.

Sending raw telemetry or high-frequency logs directly to Discord webhooks causes dropped events from `429 Too Many Requests` or memory leaks during traffic bursts. `draincord` buffers entries, packs them into compliant Discord embeds (under Discord's 10-embed and 6,000-character payload limits), respects Discord's rate-limit reset headers, supports automatic secondary webhook failover, and persists unsent items to SQLite across crashes.

---

## Features

- **Smart Batching**: Groups multiple log calls into a single webhook request every N seconds or when buffer thresholds are met.
- **Discord Spec Compliance**: Automatically chunks embeds to stay under the 10-embed limit and 6,000-character payload ceiling.
- **Proactive Rate-Limit Handling**: Tracks `X-RateLimit-Remaining` and `X-RateLimit-Reset-After`. Halts dispatch on `429` and retries without dropping logs.
- **Fallback Webhook Redundancy**: Automatically reroutes to `fallbackWebhookUrl` if primary webhook is invalid or unreachable.
- **SQLite Spooling**: Optional on-disk WAL queue using Node's native `node:sqlite`. Unsent items survive process crashes.
- **Pino & Syslog Adapter**: First-class `createDraincordStream` transport to plug directly into Pino or any writable stream logger.
- **Zero Runtime Dependencies**: Uses Node 18+ native `fetch` and modern ESM.
- **Clean Exit**: Hooks `beforeExit`, `SIGINT`, and `SIGTERM` to flush remaining logs before process exit.

---

## Install

```bash
npm install draincord
```

---

## Quick Start

```typescript
import { Draincord } from 'draincord';

const drain = new Draincord({
  webhookUrl: process.env.DISCORD_WEBHOOK_URL!,
  fallbackWebhookUrl: process.env.DISCORD_FALLBACK_URL, // optional failover
  flushIntervalMs: 2500, // flush every 2.5s (default 2000ms)
  username: 'Service Monitor'
});

// Fluent logging methods
drain.info('API', 'Payment succeeded', { orderId: 'ord_9182', amount: 49.99 });
drain.warn('Cache', 'Redis latency spike', { latencyMs: 340 });
drain.error('Database', 'Connection pool exhausted', new Error('Timeout after 5000ms'));

// Custom Discord embeds are also supported
drain.push({
  title: 'Deployment Finished',
  color: 0x57f287,
  fields: [{ name: 'Commit', value: 'c90a1f2', inline: true }]
});
```

---

## Integration with Pino Logger

Use `createDraincordStream` to forward structured application logs to Discord without blocking the main event loop:

```typescript
import pino from 'pino';
import { Draincord, createDraincordStream } from 'draincord';

const drain = new Draincord({
  webhookUrl: process.env.DISCORD_WEBHOOK_URL!
});

const logger = pino({}, createDraincordStream(drain, { tag: 'AUTH-SVC' }));

logger.info({ userId: 104 }, 'User signed in');
logger.error(new Error('Auth failed'), 'Token verification error');
```

---

## Persistent Spooling (SQLite)

For mission-critical audit logs or systems where crash recovery is required, pass `storage: 'sqlite'`:

```typescript
const drain = new Draincord({
  webhookUrl: process.env.DISCORD_WEBHOOK_URL!,
  storage: 'sqlite',
  sqlitePath: './data/audit-drain.db'
});
```

*Requires Node.js v22.5.0+ for native `node:sqlite`.*

---

## Benchmarks

Run `npm run bench` to measure queue and flush throughput:

```text
[MemoryQueue]
  Enqueue 10,000 items: 5.43ms (1,840,163 ops/sec)
  Flush   10,000 items: 47.13ms (212,171 ops/sec)

[SqliteQueue (WAL)]
  Enqueue 10,000 items: 4,696ms (2,129 ops/sec)
  Flush   10,000 items: 851ms   (11,750 ops/sec)
```

---

## API Reference

### `new Draincord(options)`

| Option | Type | Default | Description |
|---|---|---|---|
| `webhookUrl` | `string` | *(required)* | Primary Discord Webhook URL. |
| `fallbackWebhookUrl` | `string` | `undefined` | Secondary Webhook URL if primary fails (404/5xx). |
| `username` | `string` | `undefined` | Custom bot username. |
| `avatarUrl` | `string` | `undefined` | Custom bot avatar URL. |
| `flushIntervalMs` | `number` | `2000` | Ticker interval for batch delivery. |
| `maxBatchSize` | `number` | `10` | Max embeds per request (clamped at 10). |
| `maxCharsPerBatch` | `number` | `5000` | Safety character limit (Discord hard cap is 6000). |
| `storage` | `'memory' \| 'sqlite' \| QueueStorage` | `'memory'` | Storage queue engine. |
| `sqlitePath` | `string` | `'./.draincord.db'` | Path to SQLite WAL file if storage is `'sqlite'`. |
| `autoExitHook` | `boolean` | `true` | Flushes queue on `SIGINT` / `SIGTERM` / `beforeExit`. |
| `onError` | `(err: Error) => void` | `undefined` | Handler for permanent network/dispatch errors. |

### Methods

- **`drain.info(tag, message, meta?)`**: Enqueues an info-level embed (blue).
- **`drain.warn(tag, message, meta?)`**: Enqueues a warning embed (yellow).
- **`drain.error(tag, message, error | meta?)`**: Enqueues an error embed (red, auto-formats error stacks).
- **`drain.fatal(tag, message, error | meta?)`**: Enqueues a fatal incident embed (dark red).
- **`drain.debug(tag, message, meta?)`**: Enqueues a debug embed (grey).
- **`drain.push(entryOrEmbed)`**: Pushes a custom log entry or raw Discord embed directly.
- **`drain.flush()`**: Immediately drains and dispatches all queued entries.
- **`drain.size()`**: Returns current number of pending queued logs.
- **`drain.close()`**: Clears the flush ticker, performs a final flush, and releases database locks.

---

## License

GNU General Public License v3.0 (GPL-3.0-or-later). See [LICENSE](./LICENSE) for details.

Copyright (c) 2026 Iris ([@iriss-dev](https://github.com/iriss-dev)).
