/**
 * 运行时配置。集中读取环境变量，避免散落各处。
 * 切勿在源码写死真实密钥（见 CLAUDE.md 安全要求）。
 */

const isProduction = process.env.NODE_ENV === 'production';

/** 开发环境下允许的占位 JWT 密钥；生产必须由环境变量提供真实值。 */
const DEV_JWT_SECRET = 'dev-only-insecure-jwt-secret-change-me';

/** 公开可知的占位密钥（出现在仓库/文档/示例中），生产环境必须拒绝。 */
const KNOWN_PLACEHOLDER_SECRETS = new Set([
  DEV_JWT_SECRET,
  'please-change-this-secret',
  'change-me',
]);

function resolveJwtSecret(): string {
  const fromEnv = process.env.JWT_SECRET?.trim();
  if (fromEnv) {
    // 生产环境 fail-closed：拒绝占位/过短密钥，否则任何人都能伪造任意用户的 JWT。
    if (isProduction && (KNOWN_PLACEHOLDER_SECRETS.has(fromEnv) || fromEnv.length < 16)) {
      throw new Error(
        'JWT_SECRET is a known placeholder or shorter than 16 chars; refusing to start in production.'
      );
    }
    return fromEnv;
  }
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
  /**
   * mock 登录：开发默认开启；生产默认禁用，仅当显式设置 MOCK_LOGIN_ENABLED=true 时开启
   * （私用自托管走「体验登录+邀请码绑定」时需要，属于明确的 opt-in，不再隐式依赖 NODE_ENV）。
   */
  mockLoginEnabled: !isProduction || process.env.MOCK_LOGIN_ENABLED === 'true',
  /** 邀请码有效期（毫秒），默认 24 小时。 */
  inviteTtlMs: 24 * 60 * 60 * 1000,

  // 微信登录（Phase 11）。AppSecret 仅从环境变量读取，不写死、不返前端、不记日志。
  wechatAppId: process.env.WECHAT_APP_ID ?? '',
  wechatAppSecret: process.env.WECHAT_APP_SECRET ?? '',
  wechatConfigured: Boolean(process.env.WECHAT_APP_ID && process.env.WECHAT_APP_SECRET),

  // 对象存储（Phase 12）。密钥仅在 provider 内部按需读取，不进入此对象避免误打印。
  storageProvider: (process.env.STORAGE_PROVIDER ?? 'local') as 'local' | 'cos' | 'oss' | 'disk',
  storageBucket: process.env.STORAGE_BUCKET ?? '',
  storageRegion: process.env.STORAGE_REGION ?? '',
  storagePublicBaseUrl: process.env.STORAGE_PUBLIC_BASE_URL ?? '',
  // disk provider：照片存到本服务器磁盘（私用自托管，免 COS）。目录可用 STORAGE_DISK_DIR 指定。
  storageDiskDir: process.env.STORAGE_DISK_DIR ?? 'uploads',
} as const;
