/**
 * 足迹路由：情侣共享的「点亮地图」统计与下钻。
 * 所有接口都要求登录，并基于当前 active 情侣关系按 coupleId 做越权隔离。
 * 统计逻辑见 src/utils/footprint.ts；读取一律过滤 deletedAt: null。
 */
import type { FastifyInstance } from 'fastify';
import { requireActiveCouple } from '../utils/couple.js';
import {
  computeFootprint,
  litCitiesByProvince,
  placesAndMemoriesByCity,
} from '../utils/footprint.js';
import { success } from '../utils/response.js';

export async function footprintRoutes(app: FastifyInstance): Promise<void> {
  // 足迹概览：点亮省 / 市数量、地点与回忆总数，及对应 adcode 列表。
  app.get('/api/footprint/overview', { preHandler: [app.authenticate] }, async (request) => {
    const userId = request.user.sub;
    const couple = await requireActiveCouple(userId);

    return success(await computeFootprint(couple.id));
  });

  // 某省下钻：点亮城市列表及每个城市的地点数 / 回忆数。
  app.get(
    '/api/footprint/provinces/:provinceId',
    { preHandler: [app.authenticate] },
    async (request) => {
      const userId = request.user.sub;
      const couple = await requireActiveCouple(userId);
      const { provinceId } = request.params as { provinceId: string };

      return success(await litCitiesByProvince(couple.id, provinceId));
    }
  );

  // 某城市下钻：该城市的地点与回忆列表。
  app.get(
    '/api/footprint/cities/:cityId',
    { preHandler: [app.authenticate] },
    async (request) => {
      const userId = request.user.sub;
      const couple = await requireActiveCouple(userId);
      const { cityId } = request.params as { cityId: string };

      return success(await placesAndMemoriesByCity(couple.id, cityId));
    }
  );
}
