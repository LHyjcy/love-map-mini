/**
 * 实时位置 WebSocket 插件。
 * 提供 GET /ws/location：伴侣双方各自建立一条连接，
 * 当一方上报位置/停止/会话过期时，向「同一情侣关系下的另一方」推送事件。
 *
 * 鉴权：从 query 的 token 取 JWT（小程序 WebSocket 无法自定义 header），
 * 校验得到 userId，再取其 active 情侣关系得到 coupleId；非法则关闭连接。
 *
 * 隐私与健壮性：
 * - 只在同一 coupleId 内、且接收方 userId !== 发送方 时推送，做越权隔离。
 * - 所有 WS 操作都用 try/catch 包裹，任何 WS 故障都不得抛进 HTTP 路由。
 */
import fastifyWebsocket from '@fastify/websocket';
import type { FastifyInstance } from 'fastify';
import { requireActiveCouple } from '../utils/couple.js';

type WsEvent =
  | 'partner_location_update'
  | 'partner_location_stopped'
  | 'partner_location_expired';

interface WsClient {
  socket: { send: (data: string) => void; close: () => void };
  userId: string;
}

// coupleId -> 该情侣关系下所有在线连接
const registry = new Map<string, Set<WsClient>>();

/** 向某情侣关系下、userId !== exceptUserId 的所有连接推送事件。WS 故障静默吞掉。 */
export function broadcastToPartner(
  coupleId: string,
  exceptUserId: string,
  event: WsEvent,
  data: unknown
): void {
  try {
    const clients = registry.get(coupleId);
    if (!clients || clients.size === 0) {
      return;
    }
    const message = JSON.stringify({ event, data });
    for (const client of clients) {
      if (client.userId === exceptUserId) {
        continue;
      }
      try {
        client.socket.send(message);
      } catch {
        // 单个连接发送失败不影响其他连接
      }
    }
  } catch {
    // 任何意外都不得抛出
  }
}

/** 注册 WebSocket 能力与 /ws/location 路由。须在业务路由注册前调用。 */
export function registerLocationWs(app: FastifyInstance): void {
  void app.register(fastifyWebsocket);

  void app.register(async (instance) => {
    instance.get('/ws/location', { websocket: true }, (connection, request) => {
      // @fastify/websocket@8: connection.socket 是底层 ws；做兼容兜底。
      const raw = (connection as { socket?: unknown }).socket ?? connection;
      const socket = raw as { send: (data: string) => void; close: () => void };

      void (async () => {
        try {
          const token = (request.query as { token?: string } | undefined)?.token;
          if (!token) {
            socket.close();
            return;
          }

          let userId: string;
          try {
            const payload = app.jwt.verify<{ sub: string }>(token);
            userId = payload.sub;
          } catch {
            socket.close();
            return;
          }

          let coupleId: string;
          try {
            const couple = await requireActiveCouple(userId);
            coupleId = couple.id;
          } catch {
            socket.close();
            return;
          }

          const client: WsClient = { socket, userId };
          let set = registry.get(coupleId);
          if (!set) {
            set = new Set();
            registry.set(coupleId, set);
          }
          set.add(client);

          const cleanup = () => {
            try {
              const current = registry.get(coupleId);
              if (current) {
                current.delete(client);
                if (current.size === 0) {
                  registry.delete(coupleId);
                }
              }
            } catch {
              // 忽略清理异常
            }
          };

          const ws = socket as unknown as {
            on: (event: string, cb: () => void) => void;
          };
          try {
            ws.on('close', cleanup);
            ws.on('error', cleanup);
          } catch {
            // 若底层无 on 接口，忽略（连接将随进程结束）
          }
        } catch {
          try {
            socket.close();
          } catch {
            // 忽略
          }
        }
      })();
    });
  });
}
