// SPDX-License-Identifier: GPL-3.0-or-later
// Copyright (C) 2026 Iris (@iriss-dev) <iriss.smith08@proton.me>

import test from 'node:test';
import assert from 'node:assert/strict';
import { Draincord } from '../dist/index.js';

test('draincord - batches logs and flushes to webhook', async () => {
  const sentPayloads = [];

  const mockFetch = async (_url, options) => {
    const payload = JSON.parse(options.body);
    sentPayloads.push(payload);
    return new Response(null, {
      status: 204,
      headers: {
        'x-ratelimit-remaining': '4',
        'x-ratelimit-reset-after': '1.0'
      }
    });
  };

  const drain = new Draincord({
    webhookUrl: 'https://discord.com/api/webhooks/mock/123',
    flushIntervalMs: 60000, // manual flush for test
    autoExitHook: false,
    fetchFn: mockFetch
  });

  // Push 15 logs
  for (let i = 0; i < 15; i++) {
    drain.info('WORKER', `Task completed #${i}`, { index: i });
  }

  assert.equal(await drain.size(), 15);
  await drain.flush();

  // 15 items should be chunked into 2 calls: 10 embeds and 5 embeds
  assert.equal(sentPayloads.length, 2);
  assert.equal(sentPayloads[0].embeds.length, 10);
  assert.equal(sentPayloads[1].embeds.length, 5);
  assert.equal(await drain.size(), 0);

  await drain.close();
});

test('draincord - requeues items on 429 without dropping data', async () => {
  let callCount = 0;

  const mockFetch = async () => {
    callCount++;
    if (callCount === 1) {
      // First call responds with 429
      return new Response(JSON.stringify({ retry_after: 0.1 }), {
        status: 429,
        headers: { 'retry-after': '0.1' }
      });
    }
    return new Response(null, { status: 204 });
  };

  const drain = new Draincord({
    webhookUrl: 'https://discord.com/api/webhooks/mock/123',
    flushIntervalMs: 60000,
    autoExitHook: false,
    fetchFn: mockFetch
  });

  drain.error('CRITICAL', 'Primary server disconnected');
  drain.warn('FAILOVER', 'Switching to replica');

  assert.equal(await drain.size(), 2);

  // Trigger flush (will hit 429 on first call)
  await drain.flush();

  // Queue should still contain the 2 items because they were requeued
  assert.equal(await drain.size(), 2);

  // Wait for cooldown to expire
  await new Promise((r) => setTimeout(r, 260));

  // Flush again -> success
  await drain.flush();
  assert.equal(await drain.size(), 0);

  await drain.close();
});
