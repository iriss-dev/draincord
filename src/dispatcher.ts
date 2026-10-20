// SPDX-License-Identifier: GPL-3.0-or-later
// Copyright (C) 2026 Iris (@iriss-dev) <iriss.smith08@proton.me>

import type { DiscordEmbed, WebhookPayload } from './types.js';

export interface DispatchResult {
  ok: boolean;
  status: number;
  retryAfterMs?: number;
  error?: Error;
}

export type FetchFunction = typeof fetch;

export class WebhookDispatcher {
  private webhookUrl: string;
  private fallbackWebhookUrl?: string;
  private username?: string;
  private avatarUrl?: string;
  private fetchFn: FetchFunction;
  private rateLimitResetAt = 0;

  constructor(options: {
    webhookUrl: string;
    fallbackWebhookUrl?: string;
    username?: string;
    avatarUrl?: string;
    fetchFn?: FetchFunction;
  }) {
    this.webhookUrl = options.webhookUrl;
    this.fallbackWebhookUrl = options.fallbackWebhookUrl;
    this.username = options.username;
    this.avatarUrl = options.avatarUrl;
    this.fetchFn = options.fetchFn || globalThis.fetch;
  }

  isRateLimited(): boolean {
    return Date.now() < this.rateLimitResetAt;
  }

  getCooldownRemainingMs(): number {
    const diff = this.rateLimitResetAt - Date.now();
    return diff > 0 ? diff : 0;
  }

  async sendEmbeds(embeds: DiscordEmbed[]): Promise<DispatchResult> {
    if (this.isRateLimited()) {
      return {
        ok: false,
        status: 429,
        retryAfterMs: this.getCooldownRemainingMs()
      };
    }

    const payload: WebhookPayload = {
      embeds
    };

    if (this.username) payload.username = this.username;
    if (this.avatarUrl) payload.avatar_url = this.avatarUrl;

    try {
      const response = await this.fetchFn(this.webhookUrl, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json'
        },
        body: JSON.stringify(payload)
      });

      // Handle rate limits
      if (response.status === 429) {
        let retrySec = 1;
        const retryHeader = response.headers.get('retry-after');

        if (retryHeader) {
          retrySec = parseFloat(retryHeader) || 1;
        } else {
          try {
            const body = await response.json() as { retry_after?: number };
            if (typeof body?.retry_after === 'number') {
              retrySec = body.retry_after;
            }
          } catch {
            // body unreadable, stick to 1s default
          }
        }

        const waitMs = Math.ceil(retrySec * 1000) + 150;
        this.rateLimitResetAt = Date.now() + waitMs;

        return {
          ok: false,
          status: 429,
          retryAfterMs: waitMs
        };
      }

      // Proactive rate limit tracking
      const remaining = response.headers.get('x-ratelimit-remaining');
      const resetAfter = response.headers.get('x-ratelimit-reset-after');

      if (remaining === '0' && resetAfter) {
        const resetSec = parseFloat(resetAfter);
        if (!isNaN(resetSec) && resetSec > 0) {
          this.rateLimitResetAt = Date.now() + Math.ceil(resetSec * 1000);
        }
      }

      if (!response.ok) {
        if (this.fallbackWebhookUrl && response.status !== 429) {
          return this.sendToUrl(this.fallbackWebhookUrl, payload);
        }
        const errorText = await response.text().catch(() => '');
        return {
          ok: false,
          status: response.status,
          error: new Error(`Discord HTTP ${response.status}: ${errorText}`)
        };
      }

      return {
        ok: true,
        status: response.status
      };
    } catch (err) {
      if (this.fallbackWebhookUrl) {
        return this.sendToUrl(this.fallbackWebhookUrl, payload);
      }
      return {
        ok: false,
        status: 0,
        error: err instanceof Error ? err : new Error(String(err))
      };
    }
  }

  private async sendToUrl(url: string, payload: WebhookPayload): Promise<DispatchResult> {
    try {
      const res = await this.fetchFn(url, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(payload)
      });
      return { ok: res.ok, status: res.status };
    } catch (err) {
      return {
        ok: false,
        status: 0,
        error: err instanceof Error ? err : new Error(String(err))
      };
    }
  }
}
