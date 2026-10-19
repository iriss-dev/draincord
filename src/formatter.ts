// SPDX-License-Identifier: GPL-3.0-or-later
// Copyright (C) 2026 Iris (@iriss-dev) <iriss.smith08@proton.me>

import type { DiscordEmbed, LogEntry, LogLevel } from './types.js';

export const LEVEL_COLORS: Record<LogLevel, number> = {
  debug: 0x747f8d,
  info: 0x5865f2,
  warn: 0xfee75c,
  error: 0xed4245,
  fatal: 0x992d22
};

export function estimateEmbedLength(embed: DiscordEmbed): number {
  let len = 0;
  if (embed.title) len += embed.title.length;
  if (embed.description) len += embed.description.length;
  if (embed.footer?.text) len += embed.footer.text.length;
  if (embed.author?.name) len += embed.author.name.length;

  if (embed.fields) {
    for (const f of embed.fields) {
      len += (f.name?.length || 0) + (f.value?.length || 0);
    }
  }

  return len;
}

export function entryToEmbed(entry: LogEntry): DiscordEmbed {
  if (entry.embed) {
    return entry.embed;
  }

  const levelTag = entry.level.toUpperCase();
  const title = `[${levelTag}] ${entry.tag}`;

  let description = entry.message || '';
  if (description.length > 4000) {
    description = description.slice(0, 3997) + '...';
  }

  const embed: DiscordEmbed = {
    title,
    description,
    color: LEVEL_COLORS[entry.level] ?? LEVEL_COLORS.info,
    timestamp: new Date(entry.timestamp).toISOString()
  };

  if (entry.meta && Object.keys(entry.meta).length > 0) {
    const metaStr = JSON.stringify(entry.meta, null, 2);
    const value = metaStr.length > 1000
      ? `\`\`\`json\n${metaStr.slice(0, 990)}...\n\`\`\``
      : `\`\`\`json\n${metaStr}\n\`\`\``;

    embed.fields = [
      {
        name: 'Context',
        value,
        inline: false
      }
    ];
  }

  return embed;
}

export interface ChunkResult {
  entries: LogEntry[];
  embeds: DiscordEmbed[];
}

export function chunkEntries(
  entries: LogEntry[],
  maxBatchSize: number = 10,
  maxCharsPerBatch: number = 5000
): ChunkResult[] {
  const chunks: ChunkResult[] = [];
  let currentEntries: LogEntry[] = [];
  let currentEmbeds: DiscordEmbed[] = [];
  let currentChars = 0;

  for (const entry of entries) {
    const embed = entryToEmbed(entry);
    const embedLen = estimateEmbedLength(embed);

    const willExceedCount = currentEmbeds.length >= Math.min(maxBatchSize, 10);
    const willExceedChars = currentChars + embedLen > maxCharsPerBatch && currentEmbeds.length > 0;

    if (willExceedCount || willExceedChars) {
      chunks.push({ entries: currentEntries, embeds: currentEmbeds });
      currentEntries = [];
      currentEmbeds = [];
      currentChars = 0;
    }

    currentEntries.push(entry);
    currentEmbeds.push(embed);
    currentChars += embedLen;
  }

  if (currentEntries.length > 0) {
    chunks.push({ entries: currentEntries, embeds: currentEmbeds });
  }

  return chunks;
}
