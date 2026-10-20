// SPDX-License-Identifier: GPL-3.0-or-later
// Copyright (C) 2026 Iris (@iriss-dev) <iriss.smith08@proton.me>

import test from 'node:test';
import assert from 'node:assert/strict';
import { Draincord, createDraincordStream } from '../dist/index.js';

test('stream - adapts Pino JSON logs into Draincord entries', async () => {
  const drain = new Draincord({
    webhookUrl: 'https://discord.com/api/webhooks/mock/123',
    flushIntervalMs: 60000,
    autoExitHook: false,
    fetchFn: async () => new Response(null, { status: 204 })
  });

  const stream = createDraincordStream(drain, { tag: 'TEST-SRV' });

  // Simulate Pino JSON log lines
  const line1 = JSON.stringify({ level: 30, time: Date.now(), msg: 'Server listening on :3000', port: 3000 });
  const line2 = JSON.stringify({ level: 50, time: Date.now(), msg: 'Uncaught database exception', code: 'ECONNREFUSED' });

  await new Promise((resolve) => stream.write(line1 + '\n', resolve));
  await new Promise((resolve) => stream.write(line2 + '\n', resolve));

  assert.equal(await drain.size(), 2);
  await drain.close();
});

test('dispatcher - routes to fallbackWebhookUrl when primary returns 404', async () => {
  let fallbackCalled = false;

  const mockFetch = async (url) => {
    if (url.includes('primary')) {
      return new Response('Unknown Webhook', { status: 404 });
    }
    if (url.includes('fallback')) {
      fallbackCalled = true;
      return new Response(null, { status: 204 });
    }
    return new Response(null, { status: 500 });
  };

  const drain = new Draincord({
    webhookUrl: 'https://discord.com/api/webhooks/primary/123',
    fallbackWebhookUrl: 'https://discord.com/api/webhooks/fallback/456',
    flushIntervalMs: 60000,
    autoExitHook: false,
    fetchFn: mockFetch
  });

  drain.error('SRV', 'Primary outage test');
  await drain.flush();

  assert.equal(fallbackCalled, true);
  assert.equal(await drain.size(), 0);

  await drain.close();
});
