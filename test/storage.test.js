// SPDX-License-Identifier: GPL-3.0-or-later
// Copyright (C) 2026 Iris (@iriss-dev) <iriss.smith08@proton.me>

import test from 'node:test';
import assert from 'node:assert/strict';
import { existsSync, unlinkSync } from 'node:fs';
import { MemoryQueue, SqliteQueue } from '../dist/index.js';

test('storage - MemoryQueue basic push, popBatch and requeue', () => {
  const q = new MemoryQueue();
  assert.equal(q.size(), 0);

  q.push({ level: 'info', tag: 'A', message: 'm1', timestamp: 1 });
  q.push({ level: 'info', tag: 'B', message: 'm2', timestamp: 2 });
  q.push({ level: 'info', tag: 'C', message: 'm3', timestamp: 3 });
  assert.equal(q.size(), 3);

  const batch = q.popBatch(2);
  assert.equal(batch.length, 2);
  assert.equal(batch[0].tag, 'A');
  assert.equal(batch[1].tag, 'B');
  assert.equal(q.size(), 1);

  q.requeue(batch);
  assert.equal(q.size(), 3);
  const rePopped = q.popBatch(1);
  assert.equal(rePopped[0].tag, 'A');
});

test('storage - SqliteQueue persistence and recovery across instances', () => {
  const testDbPath = './.test_draincord_queue.db';
  if (existsSync(testDbPath)) unlinkSync(testDbPath);

  try {
    const q1 = new SqliteQueue(testDbPath);
    q1.push({ level: 'warn', tag: 'AUTH', message: 'Failed attempt 1', timestamp: 100 });
    q1.push({ level: 'error', tag: 'AUTH', message: 'Failed attempt 2', timestamp: 200 });
    assert.equal(q1.size(), 2);
    q1.close();

    // Reopen queue with new instance pointing to same file
    const q2 = new SqliteQueue(testDbPath);
    assert.equal(q2.size(), 2);

    const items = q2.popBatch(10);
    assert.equal(items.length, 2);
    assert.equal(items[0].tag, 'AUTH');
    assert.equal(items[0].message, 'Failed attempt 1');
    assert.equal(q2.size(), 0);

    q2.close();
  } finally {
    if (existsSync(testDbPath)) unlinkSync(testDbPath);
    if (existsSync(testDbPath + '-wal')) unlinkSync(testDbPath + '-wal');
    if (existsSync(testDbPath + '-shm')) unlinkSync(testDbPath + '-shm');
  }
});
