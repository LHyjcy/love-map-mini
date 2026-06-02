/**
 * 对象存储抽象（Phase 12）。
 * 目标：照片由客户端直传对象存储，后端只签发临时上传凭证并保存元数据，
 * 大文件不经过业务服务。
 *
 * 安全要求（CLAUDE.md）：
 * - 存储密钥仅从环境变量读取，绝不写死、绝不返回前端。
 * - 限制可上传的类型与大小。
 *
 * 说明：真实 COS/OSS 预签名依赖各自厂商 SDK（重依赖）。在未确认引入前，
 * 云 provider 返回明确的「未接线」错误；`local` provider 用于开发联调。
 */
import { randomBytes } from 'node:crypto';
import { config } from '../config.js';
import { AppError } from '../utils/errors.js';

/** 允许上传的图片类型及扩展名。 */
const ALLOWED_MIME: Record<string, string> = {
  'image/jpeg': 'jpg',
  'image/png': 'png',
  'image/webp': 'webp',
  'image/gif': 'gif',
};

/** 单文件大小上限：10 MB。 */
export const MAX_UPLOAD_BYTES = 10 * 1024 * 1024;

export interface UploadCredential {
  provider: string;
  /** 对象存储中的 key，回写 Media.objectKey。 */
  objectKey: string;
  /** 最终可访问 URL，回写 Media.fileUrl。 */
  fileUrl: string;
  /** 直传地址（local 模式下为 null，由客户端走本地/占位流程）。 */
  uploadUrl: string | null;
  /** 允许的最大字节数。 */
  maxBytes: number;
  /** 允许的 mime。 */
  mimeType: string;
}

function buildObjectKey(ext: string): string {
  const rand = randomBytes(16).toString('hex');
  // 不使用 Date 提供的随机性做安全用途；仅用于路径可读性的占位前缀。
  return `uploads/${rand}.${ext}`;
}

function publicUrlFor(objectKey: string): string {
  const base = config.storagePublicBaseUrl.replace(/\/+$/, '');
  return base ? `${base}/${objectKey}` : `/${objectKey}`;
}

/**
 * 签发一次上传凭证。校验类型；按 provider 返回直传信息。
 * 真实云直传 URL 的签名在引入厂商 SDK 后补全。
 */
export function createUploadCredential(mimeType: string): UploadCredential {
  const ext = ALLOWED_MIME[mimeType];
  if (!ext) {
    throw new AppError(
      'UNSUPPORTED_MEDIA_TYPE',
      `Unsupported image type. Allowed: ${Object.keys(ALLOWED_MIME).join(', ')}.`,
      415
    );
  }

  const objectKey = buildObjectKey(ext);
  const base: Omit<UploadCredential, 'uploadUrl'> = {
    provider: config.storageProvider,
    objectKey,
    fileUrl: publicUrlFor(objectKey),
    maxBytes: MAX_UPLOAD_BYTES,
    mimeType,
  };

  switch (config.storageProvider) {
    case 'local':
      // 开发模式：不做真实签名，客户端拿 objectKey/fileUrl 走占位上传后回写元数据。
      return { ...base, uploadUrl: null };
    case 'cos':
    case 'oss':
      // 真实预签名需引入 cos-nodejs-sdk-v5 / ali-oss（重依赖，待确认后接入）。
      throw new AppError(
        'STORAGE_PROVIDER_NOT_WIRED',
        `Storage provider "${config.storageProvider}" requires its vendor SDK, not yet wired.`,
        501
      );
    default:
      throw new AppError(
        'STORAGE_PROVIDER_UNKNOWN',
        `Unknown storage provider: ${config.storageProvider}.`,
        500
      );
  }
}
