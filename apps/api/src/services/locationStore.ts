/**
 * 最新位置缓存（latest-location cache）。
 * 仅缓存「某情侣关系下某用户」的最新一个位置点，供伴侣实时拉取。
 *
 * 设计：
 * - 若设置了 REDIS_URL，则用 Redis（SET EX，带 TTL）。
 * - 否则退化为进程内 Map（带过期时间戳），保证本地开发无 Redis 也可运行。
 * - ioredis 客户端用 lazyConnect 懒连接；任何 Redis 异常都吞掉并回退内存，
 *   保证服务在没有 Redis 时永不崩溃。
 *
 * 隐私：缓存的是用户主动发起的临时分享会话产生的位置点，带 TTL（不超过会话过期时间），
 * 会话停止时由调用方主动清除。
 */
import Redis from 'ioredis';

export interface LatestLocationPayload {
  latitude: number;
  longitude: number;
  accuracy?: number | null;
  address?: string | null;
  serverTime: string | Date;
  [key: string]: unknown;
}

// 进程内回退存储：key -> { value, expiresAt(ms) }
const memoryStore = new Map<string, { value: LatestLocationPayload; expiresAt: number }>();

let redis: Redis | null = null;
let redisDisabled = false;

/** 懒初始化 Redis 客户端；仅当配置了 REDIS_URL 时启用，出错则永久回退内存。 */
function getRedis(): Redis | null {
  if (redisDisabled) {
    return null;
  }
  if (!process.env.REDIS_URL) {
    redisDisabled = true;
    return null;
  }
  if (!redis) {
    try {
      redis = new Redis(process.env.REDIS_URL, { lazyConnect: true });
      // 避免未处理的 error 事件导致进程崩溃；出错后回退内存。
      redis.on('error', () => {
        redisDisabled = true;
      });
    } catch {
      redisDisabled = true;
      redis = null;
      return null;
    }
  }
  return redis;
}

function keyOf(coupleId: string, userId: string): string {
  return `location:latest:${coupleId}:${userId}`;
}

/** 写入最新位置，ttlSeconds 秒后过期。 */
export async function setLatest(
  coupleId: string,
  userId: string,
  payload: LatestLocationPayload,
  ttlSeconds: number
): Promise<void> {
  const key = keyOf(coupleId, userId);
  const ttl = Math.max(1, Math.floor(ttlSeconds));
  const client = getRedis();
  if (client) {
    try {
      await client.set(key, JSON.stringify(payload), 'EX', ttl);
      return;
    } catch {
      // 回退内存
    }
  }
  memoryStore.set(key, { value: payload, expiresAt: Date.now() + ttl * 1000 });
}

/** 读取最新位置，已过期或不存在返回 null。 */
export async function getLatest(
  coupleId: string,
  userId: string
): Promise<LatestLocationPayload | null> {
  const key = keyOf(coupleId, userId);
  const client = getRedis();
  if (client) {
    try {
      const raw = await client.get(key);
      if (!raw) {
        return null;
      }
      return JSON.parse(raw) as LatestLocationPayload;
    } catch {
      // 回退内存
    }
  }
  const entry = memoryStore.get(key);
  if (!entry) {
    return null;
  }
  if (entry.expiresAt <= Date.now()) {
    memoryStore.delete(key);
    return null;
  }
  return entry.value;
}

/** 清除最新位置（会话停止/到期时调用）。 */
export async function clearLatest(coupleId: string, userId: string): Promise<void> {
  const key = keyOf(coupleId, userId);
  const client = getRedis();
  if (client) {
    try {
      await client.del(key);
    } catch {
      // 忽略，继续清内存
    }
  }
  memoryStore.delete(key);
}
