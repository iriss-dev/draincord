// SPDX-License-Identifier: GPL-3.0-or-later
// Copyright (C) 2026 Iris (@iriss-dev) <iriss.smith08@proton.me>

import test from 'node:test';
import assert from 'node:assert/strict';
import {
  chunkEntries,
  entryToEmbed,
  estimateEmbedLength,
  LEVEL_COLORS
} from '../dist/index.js';

test('formatter - entryToEmbed sets proper colors and formatting', () => {
  const entry = {
    level: 'error',
    tag: 'DATABASE',
    message: 'Connection timed out',
    timestamp: 1700000000000,
    meta: { host: '10.0.0.1', port: 5432 }
  };

  const embed = entryToEmbed(entry);
  assert.equal(embed.title, '[ERROR] DATABASE');
  assert.equal(embed.description, 'Connection timed out');
  assert.equal(embed.color, LEVEL_COLORS.error);
  assert.equal(embed.fields?.length, 1);
  assert.ok(embed.fields?.[0].value.includes('10.0.0.1'));
});

test('formatter - estimateEmbedLength computes accurate char count', () => {
  const embed = {
    title: 'Hello',       // 5
    description: 'World', // 5
    fields: [{ name: 'A', value: 'B' }] // 1 + 1
  };
  const length = estimateEmbedLength(embed);
  assert.equal(length, 12);
});

test('formatter - chunkEntries chunks by max batch size (limit 10)', () => {
  const entries = Array.from({ length: 25 }, (_, i) => ({
    level: 'info',
    tag: 'TEST',
    message: `Message #${i}`,
    timestamp: Date.now()
  }));

  const chunks = chunkEntries(entries, 10, 5000);
  assert.equal(chunks.length, 3);
  assert.equal(chunks[0].embeds.length, 10);
  assert.equal(chunks[1].embeds.length, 10);
  assert.equal(chunks[2].embeds.length, 5);
});

test('formatter - chunkEntries splits early when char limit is exceeded', () => {
  const longText = 'x'.repeat(2600);
  const entries = [
    { level: 'info', tag: 'A', message: longText, timestamp: Date.now() },
    { level: 'info', tag: 'B', message: longText, timestamp: Date.now() },
    { level: 'info', tag: 'C', message: 'Short', timestamp: Date.now() }
  ];

  // maxChars 5000 -> two long items would exceed 5200, so they must split
  const chunks = chunkEntries(entries, 10, 5000);
  assert.equal(chunks.length, 2);
  assert.equal(chunks[0].entries.length, 1);
  assert.equal(chunks[1].entries.length, 2);
});
