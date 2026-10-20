// SPDX-License-Identifier: GPL-3.0-or-later
// Copyright (C) 2026 Iris (@iriss-dev) <iriss.smith08@proton.me>

import { Draincord } from '../dist/index.js';
import { performance } from 'node:perf_hooks';
import { existsSync, unlinkSync } from 'node:fs';

const TOTAL_LOGS = 10_000;

async function benchMemory() {
  const drain = new Draincord({
    webhookUrl: 'https://discord.com/api/webhooks/mock/bench',
    storage: 'memory',
    flushIntervalMs: 60000,
    autoExitHook: false,
    fetchFn: async () => new Response(null, { status: 204 })
  });

  const start = performance.now();
  for (let i = 0; i < TOTAL_LOGS; i++) {
    drain.info('BENCH', `Message iteration ${i}`, { index: i, timestamp: Date.now() });
  }
  const enqueueTime = performance.now() - start;

  const flushStart = performance.now();
  await drain.flush();
  const flushTime = performance.now() - flushStart;

  console.log(`[MemoryQueue]`);
  console.log(`  Enqueue ${TOTAL_LOGS} items: ${enqueueTime.toFixed(2)}ms (${Math.round(TOTAL_LOGS / (enqueueTime / 1000))} ops/sec)`);
  console.log(`  Flush ${TOTAL_LOGS} items:   ${flushTime.toFixed(2)}ms (${Math.round(TOTAL_LOGS / (flushTime / 1000))} ops/sec)\n`);

  await drain.close();
}

async function benchSqlite() {
  const dbPath = './.bench_draincord.db';
  if (existsSync(dbPath)) unlinkSync(dbPath);

  try {
    const drain = new Draincord({
      webhookUrl: 'https://discord.com/api/webhooks/mock/bench',
      storage: 'sqlite',
      sqlitePath: dbPath,
      flushIntervalMs: 60000,
      autoExitHook: false,
      fetchFn: async () => new Response(null, { status: 204 })
    });

    const start = performance.now();
    for (let i = 0; i < TOTAL_LOGS; i++) {
      drain.info('BENCH', `Message iteration ${i}`, { index: i, timestamp: Date.now() });
    }
    const enqueueTime = performance.now() - start;

    const flushStart = performance.now();
    await drain.flush();
    const flushTime = performance.now() - flushStart;

    console.log(`[SqliteQueue (WAL)]`);
    console.log(`  Enqueue ${TOTAL_LOGS} items: ${enqueueTime.toFixed(2)}ms (${Math.round(TOTAL_LOGS / (enqueueTime / 1000))} ops/sec)`);
    console.log(`  Flush ${TOTAL_LOGS} items:   ${flushTime.toFixed(2)}ms (${Math.round(TOTAL_LOGS / (flushTime / 1000))} ops/sec)\n`);

    await drain.close();
  } finally {
    if (existsSync(dbPath)) unlinkSync(dbPath);
    if (existsSync(dbPath + '-wal')) unlinkSync(dbPath + '-wal');
    if (existsSync(dbPath + '-shm')) unlinkSync(dbPath + '-shm');
  }
}

async function run() {
  console.log(`\n=== Running Draincord Benchmarks (${TOTAL_LOGS} entries) ===\n`);
  await benchMemory();
  await benchSqlite();
}

run().catch(console.error);
