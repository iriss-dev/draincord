// SPDX-License-Identifier: GPL-3.0-or-later
// Copyright (C) 2026 Iris (@iriss-dev) <iriss.smith08@proton.me>

import test from 'node:test';
import assert from 'node:assert/strict';
import { WebhookDispatcher } from '../dist/index.js';

test('dispatcher - handles successful 204 No Content response', async () => {
  let requestedUrl = '';
  let sentBody = '';

  const mockFetch = async (url, options) => {
    requestedUrl = String(url);
    sentBody = String(options.body);
    return new Response(null, {
      status: 204,
      headers: {
        'x-ratelimit-remaining': '5',
        'x-ratelimit-reset-after': '2.0'
      }
    });
  };

  const dispatcher = new WebhookDispatcher({
    webhookUrl: 'https://discord.com/api/webhooks/123/xyz',
    username: 'TestLogger',
    fetchFn: mockFetch
  });

  const res = await dispatcher.sendEmbeds([{ title: 'Test Embed' }]);
  assert.equal(res.ok, true);
  assert.equal(res.status, 204);
  assert.equal(requestedUrl, 'https://discord.com/api/webhooks/123/xyz');
  assert.ok(sentBody.includes('TestLogger'));
  assert.equal(dispatcher.isRateLimited(), false);
});

test('dispatcher - handles 429 Too Many Requests and enters cooldown', async () => {
  const mockFetch = async () => {
    return new Response(JSON.stringify({ retry_after: 0.5, message: 'You are being rate limited.' }), {
      status: 429,
      headers: {
        'content-type': 'application/json',
        'retry-after': '0.5'
      }
    });
  };

  const dispatcher = new WebhookDispatcher({
    webhookUrl: 'https://discord.com/api/webhooks/123/xyz',
    fetchFn: mockFetch
  });

  const res = await dispatcher.sendEmbeds([{ title: 'Rate Limited' }]);
  assert.equal(res.ok, false);
  assert.equal(res.status, 429);
  assert.ok(res.retryAfterMs && res.retryAfterMs >= 500);
  assert.equal(dispatcher.isRateLimited(), true);

  // Subsequent call should be blocked immediately without hitting fetch
  let secondCallMade = false;
  dispatcher['fetchFn'] = async () => {
    secondCallMade = true;
    return new Response(null, { status: 204 });
  };

  const immediateRes = await dispatcher.sendEmbeds([{ title: 'Blocked' }]);
  assert.equal(immediateRes.ok, false);
  assert.equal(immediateRes.status, 429);
  assert.equal(secondCallMade, false);
});
