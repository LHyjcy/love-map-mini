import { argv } from 'node:process';
import { pathToFileURL } from 'node:url';
import Fastify from 'fastify';
import { registerAuth } from './plugins/auth.js';
import { authRoutes } from './routes/auth.js';
import { checkinRoutes } from './routes/checkins.js';
import { coupleRoutes } from './routes/couples.js';
import { dashboardRoutes } from './routes/dashboard.js';
import { eventRoutes } from './routes/events.js';
import { healthRoutes } from './routes/health.js';
import { mediaRoutes } from './routes/media.js';
import { memoryRoutes } from './routes/memories.js';
import { placeRoutes } from './routes/places.js';
import { pointRoutes } from './routes/points.js';
import { privacyRoutes } from './routes/privacy.js';
import { publicShareRoutes } from './routes/publicShare.js';
import { shopRoutes } from './routes/shop.js';
import { taskRoutes } from './routes/tasks.js';
import { uploadRoutes } from './routes/uploads.js';
import { errorHandler } from './utils/errors.js';
import { failure } from './utils/response.js';

export function buildServer() {
  const app = Fastify({
    logger: {
      level: process.env.NODE_ENV === 'production' ? 'info' : 'debug',
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

  // 路由注册
  app.register(healthRoutes);
  app.register(authRoutes);
  app.register(coupleRoutes);
  app.register(placeRoutes);
  app.register(memoryRoutes);
  app.register(mediaRoutes);
  app.register(uploadRoutes);
  app.register(checkinRoutes);
  app.register(taskRoutes);
  app.register(pointRoutes);
  app.register(shopRoutes);
  app.register(eventRoutes);
  app.register(dashboardRoutes);
  app.register(privacyRoutes);
  app.register(publicShareRoutes);

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
