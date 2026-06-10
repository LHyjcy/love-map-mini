import { argv } from 'node:process';
import { pathToFileURL } from 'node:url';
import Fastify from 'fastify';
import { config } from './config.js';
import { registerAuth } from './plugins/auth.js';
import { registerCors } from './plugins/cors.js';
import { registerLocationWs } from './plugins/ws.js';
import { registerRateLimit } from './plugins/rateLimit.js';
import { aiRoutes } from './routes/ai.js';
import { profileRoutes } from './routes/profile.js';
import { feedbackRoutes } from './routes/feedback.js';
import { accountRoutes } from './routes/account.js';
import { registerDiskStorage } from './routes/diskStorage.js';
import { authRoutes } from './routes/auth.js';
import { checkinRoutes } from './routes/checkins.js';
import { coCheckinRoutes } from './routes/coCheckin.js';
import { coupleRoutes } from './routes/couples.js';
import { exportRoutes } from './routes/export.js';
import { dashboardRoutes } from './routes/dashboard.js';
import { eventRoutes } from './routes/events.js';
import { healthRoutes } from './routes/health.js';
import { mediaRoutes } from './routes/media.js';
import { memoryRoutes } from './routes/memories.js';
import { moodRoutes } from './routes/moods.js';
import { qaRoutes } from './routes/qa.js';
import { footprintRoutes } from './routes/footprint.js';
import { geoRoutes } from './routes/geo.js';
import { mapMarkerRoutes } from './routes/mapMarkers.js';
import { mapServiceRoutes } from './routes/map.js';
import { locationRoutes } from './routes/location.js';
import { notificationRoutes } from './routes/notifications.js';
import { placeRoutes } from './routes/places.js';
import { placeVoteRoutes } from './routes/placeVotes.js';
import { reviewRoutes } from './routes/review.js';
import { planRoutes } from './routes/plans.js';
import { pointRoutes } from './routes/points.js';
import { privacyRoutes } from './routes/privacy.js';
import { publicMapRoutes } from './routes/publicMap.js';
import { publicShareRoutes } from './routes/publicShare.js';
import { searchRoutes } from './routes/search.js';
import { shopRoutes } from './routes/shop.js';
import { taskRoutes } from './routes/tasks.js';
import { uploadRoutes } from './routes/uploads.js';
import { errorHandler } from './utils/errors.js';
import { failure } from './utils/response.js';

export function buildServer() {
  const app = Fastify({
    logger: {
      level: process.env.NODE_ENV === 'production' ? 'info' : 'debug',
      // 请求日志只记录去掉查询串的 URL：避免把 WS token、上传签名等敏感查询参数写进日志。
      serializers: {
        req(req) {
          return {
            method: req.method,
            url: String(req.url).split('?')[0],
            hostname: req.hostname,
            remoteAddress: req.ip,
          };
        },
      },
    },
  });

  // 统一错误响应
  app.setErrorHandler(errorHandler);

  // 统一 404 响应
  app.setNotFoundHandler((request, reply) => {
    reply
      .status(404)
      .send(failure('NOT_FOUND', `Route ${request.method} ${request.url} not found`));
  });

  // 鉴权能力（须在业务路由注册前，保证 app.authenticate 可用）
  registerAuth(app);

  // 跨域支持（须在业务路由注册前，确保 OPTIONS 预检在 onRequest 阶段被处理）
  registerCors(app);

  // 实时位置 WebSocket（须在业务路由注册前注册 @fastify/websocket）
  registerLocationWs(app);

  // 敏感接口（登录/绑定）限流（须在业务路由注册前）
  registerRateLimit(app);

  // 路由注册
  app.register(healthRoutes);
  app.register(authRoutes);
  app.register(coupleRoutes);
  app.register(placeRoutes);
  app.register(placeVoteRoutes);
  app.register(reviewRoutes);
  app.register(planRoutes);
  app.register(searchRoutes);
  app.register(memoryRoutes);
  app.register(mediaRoutes);
  app.register(uploadRoutes);
  app.register(checkinRoutes);
  app.register(coCheckinRoutes);
  app.register(exportRoutes);
  app.register(taskRoutes);
  app.register(pointRoutes);
  app.register(shopRoutes);
  app.register(eventRoutes);
  app.register(dashboardRoutes);
  app.register(privacyRoutes);
  app.register(publicShareRoutes);
  app.register(publicMapRoutes);
  app.register(notificationRoutes);
  app.register(footprintRoutes);
  app.register(geoRoutes);
  app.register(mapMarkerRoutes);
  app.register(mapServiceRoutes);
  app.register(locationRoutes);
  app.register(moodRoutes);
  app.register(qaRoutes);
  app.register(aiRoutes);
  app.register(profileRoutes);
  app.register(feedbackRoutes);
  app.register(accountRoutes);

  // 本地磁盘照片存储（仅 STORAGE_PROVIDER=disk 时注册；含图片类型 body 解析 + 收发图路由）
  if (config.storageProvider === 'disk') {
    registerDiskStorage(app);
  }

  return app;
}

async function start() {
  const app = buildServer();
  const port = Number(process.env.PORT ?? 3000);
  const host = process.env.HOST ?? '0.0.0.0';

  try {
    await app.listen({ port, host });
    app.log.info(`love-map-mini API listening on http://${host}:${port}`);
  } catch (err) {
    app.log.error(err);
    process.exit(1);
  }
}

// 直接运行时启动服务（被 import 时不自动启动，便于测试）
const isMain = argv[1] ? import.meta.url === pathToFileURL(argv[1]).href : false;
if (isMain) {
  void start();
}
