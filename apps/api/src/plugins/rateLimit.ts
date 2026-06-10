import type { FastifyInstance } from 'fastify';
import { failure } from '../utils/response.js';

/**
 * 极简内存版固定窗口限流（无第三方依赖）。
 *
 * 目的：仅对敏感接口（登录 / 邀请 / 接受邀请）做按 IP 的粗粒度限流，
 *       缓解暴力尝试与刷接口，而不影响普通业务接口。
 *
 * 说明：
 * - 仅作用于 /api/auth/* 以及 /api/couples/invite、/api/couples/accept。
 * - 固定窗口：每个 (ip + path) 在 WINDOW_MS 内最多 MAX_HITS 次，超出返回 429。
 * - 内存计数，进程重启即清零；多实例部署不共享，仅作第一道防线。
 * - 通过 onRequest 钩子实现，绝不抛出；异常一律放行，避免限流逻辑影响可用性。
 */

const WINDOW_MS = 60 * 1000;
const MAX_HITS = 30;
const CLEANUP_INTERVAL_MS = 5 * 60 * 1000;

interface WindowState {
  count: number;
  /** 窗口起始时间戳（毫秒） */
  windowStart: number;
}

function isSensitivePath(url: string): boolean {
  // 去掉查询串，仅比较 path 部分
  const path = url.split('?')[0];
  return (
    path.startsWith('/api/auth/') ||
    path === '/api/couples/invite' ||
    path === '/api/couples/accept'
  );
}

export function registerRateLimit(app: FastifyInstance): void {
  const buckets = new Map<string, WindowState>();

  // 周期清理过期窗口，避免内存无限增长；unref 不阻止进程退出。
  const timer = setInterval(() => {
    const now = Date.now();
    for (const [key, state] of buckets) {
      if (now - state.windowStart >= WINDOW_MS) {
        buckets.delete(key);
      }
    }
  }, CLEANUP_INTERVAL_MS);
  if (typeof timer.unref === 'function') {
    timer.unref();
  }

  app.addHook('onRequest', (request, reply, done) => {
    try {
      const url = request.url || '';
      if (!isSensitivePath(url)) {
        done();
        return;
      }

      const path = url.split('?')[0];
      const key = `${request.ip}|${path}`;
      const now = Date.now();
      const state = buckets.get(key);

      if (!state || now - state.windowStart >= WINDOW_MS) {
        buckets.set(key, { count: 1, windowStart: now });
        done();
        return;
      }

      state.count += 1;
      if (state.count > MAX_HITS) {
        reply
          .code(429)
          .send(failure('RATE_LIMITED', '请求过于频繁，请稍后再试'));
        return;
      }

      done();
    } catch {
      // 限流逻辑出现任何异常都放行，绝不影响正常请求
      done();
    }
  });
}
