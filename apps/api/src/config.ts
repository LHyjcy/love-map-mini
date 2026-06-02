/**
 * 运行时配置。集中读取环境变量，避免散落各处。
 * 切勿在源码写死真实密钥（见 CLAUDE.md 安全要求）。
 */

const isProduction = process.env.NODE_ENV === 'production';

/** 开发环境下允许的占位 JWT 密钥；生产必须由环境变量提供真实值。 */
const DEV_JWT_SECRET = 'dev-only-insecure-jwt-secret-change-me';

function resolveJwtSecret(): string {
  const fromEnv = process.env.JWT_SECRET?.trim();
  if (fromEnv) return fromEnv;
  if (isProduction) {
    // 生产缺失密钥直接失败，绝不回退到占位值。
    throw new Error('JWT_SECRET is required in production but is not set.');
  }
  return DEV_JWT_SECRET;
}

export const config = {
  env: process.env.NODE_ENV ?? 'development',
  isProduction,
  port: Number(process.env.PORT ?? 3000),
  host: process.env.HOST ?? '0.0.0.0',
  jwtSecret: resolveJwtSecret(),
  /** 登录态有效期。 */
  jwtExpiresIn: process.env.JWT_EXPIRES_IN ?? '7d',
  /** mock 登录仅用于开发联调，生产禁用。 */
  mockLoginEnabled: !isProduction,
  /** 邀请码有效期（毫秒），默认 24 小时。 */
  inviteTtlMs: 24 * 60 * 60 * 1000,

  // 微信登录（Phase 11）。AppSecret 仅从环境变量读取，不写死、不返前端、不记日志。
  wechatAppId: process.env.WECHAT_APP_ID ?? '',
  wechatAppSecret: process.env.WECHAT_APP_SECRET ?? '',
  wechatConfigured: Boolean(process.env.WECHAT_APP_ID && process.env.WECHAT_APP_SECRET),

  // 对象存储（Phase 12）。密钥仅在 provider 内部按需读取，不进入此对象避免误打印。
  storageProvider: (process.env.STORAGE_PROVIDER ?? 'local') as 'local' | 'cos' | 'oss',
  storageBucket: process.env.STORAGE_BUCKET ?? '',
  storageRegion: process.env.STORAGE_REGION ?? '',
  storagePublicBaseUrl: process.env.STORAGE_PUBLIC_BASE_URL ?? '',
} as const;
