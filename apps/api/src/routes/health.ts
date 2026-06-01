import type { FastifyInstance } from 'fastify';
import { success } from '../utils/response.js';

/**
 * 健康检查路由。公开，无需鉴权。
 */
export async function healthRoutes(app: FastifyInstance) {
  app.get('/health', async () => {
    return success({
      status: 'ok',
      service: 'love-map-mini-api',
      time: new Date().toISOString(),
    });
  });
}
