/**
 * 对象存储抽象（Phase 12）。
 * 目标：照片由客户端直传对象存储，后端只签发临时上传凭证并保存元数据，
 * 大文件不经过业务服务。
 *
 * 安全要求（CLAUDE.md）：
 * - 存储密钥仅从环境变量读取，绝不写死、绝不返回前端。
 * - 限制可上传的类型与大小。
 *
 * 说明：COS（腾讯云，Signature V5）与 OSS（阿里云，签名 V1）直传均已通过
 * Node 内置 node:crypto 实现预签名，不引入任何厂商 SDK / 新依赖。
 * `local` provider 用于开发联调（uploadUrl 为 null）。
 */
import { randomBytes, createHmac, createHash, timingSafeEqual } from 'node:crypto';
import path from 'node:path';
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

/** 去除尾部斜杠后的公共访问基础地址（未配置时为空字符串）。 */
function strippedPublicBase(): string {
  return config.storagePublicBaseUrl.replace(/\/+$/, '');
}

function publicUrlFor(objectKey: string): string {
  const base = strippedPublicBase();
  return base ? `${base}/${objectKey}` : `/${objectKey}`;
}

/** 云存储（COS/OSS）的最终访问 URL：优先公共基础地址，否则回退到存储域名。 */
function cloudFileUrl(objectKey: string, host: string): string {
  const publicBase = strippedPublicBase();
  return publicBase ? `${publicBase}/${objectKey}` : `https://${host}/${objectKey}`;
}

/** 校验云存储（COS/OSS）配置齐全并返回密钥，缺失时抛 STORAGE_NOT_CONFIGURED。 */
function requireCloudStorageKeys(providerName: string): { secretId: string; secretKey: string } {
  const secretId = process.env.STORAGE_ACCESS_KEY_ID ?? '';
  const secretKey = process.env.STORAGE_ACCESS_KEY_SECRET ?? '';
  if (!config.storageRegion || !config.storageBucket || !secretId || !secretKey) {
    throw new AppError(
      'STORAGE_NOT_CONFIGURED',
      `${providerName} requires STORAGE_REGION, STORAGE_BUCKET, STORAGE_ACCESS_KEY_ID, STORAGE_ACCESS_KEY_SECRET.`,
      500
    );
  }
  return { secretId, secretKey };
}

function hmacSha1Hex(key: string, msg: string): string {
  return createHmac('sha1', key).update(msg).digest('hex');
}

function sha1Hex(msg: string): string {
  return createHash('sha1').update(msg).digest('hex');
}

/**
 * 生成 COS（腾讯云）PUT 直传的预签名 URL，使用 COS Signature V5（HMAC-SHA1）。
 * 仅依赖 node:crypto，不引入厂商 SDK。bucket 已包含 APPID（如 myapp-1250000000）。
 */
function cosPresignedPutUrl(
  objectKey: string,
  region: string,
  bucket: string,
  secretId: string,
  secretKey: string
): { uploadUrl: string; host: string } {
  const now = Math.floor(Date.now() / 1000);
  const exp = now + 600; // 10 分钟有效期
  const keyTime = `${now};${exp}`;
  const signKey = hmacSha1Hex(secretKey, keyTime);
  // 保留斜杠，对每个分段做 URL 编码
  const encodedKey = objectKey.split('/').map(encodeURIComponent).join('/');
  const uriPath = '/' + encodedKey;
  const httpString = `put\n${uriPath}\n\n\n`; // method(lowercase)\nuri\nquery(empty)\nheaders(empty)\n
  const sha1HttpString = sha1Hex(httpString);
  const stringToSign = `sha1\n${keyTime}\n${sha1HttpString}\n`;
  const signature = hmacSha1Hex(signKey, stringToSign);

  const host = `${bucket}.cos.${region}.myqcloud.com`;
  const query =
    `q-sign-algorithm=sha1&q-ak=${secretId}` +
    `&q-sign-time=${keyTime}&q-key-time=${keyTime}` +
    `&q-header-list=&q-url-param-list=&q-signature=${signature}`;
  const uploadUrl = `https://${host}/${encodedKey}?${query}`;
  return { uploadUrl, host };
}

/**
 * 生成 OSS（阿里云）PUT 直传的预签名 URL，使用 OSS 签名 V1（HMAC-SHA1 + base64）。
 * 仅依赖 node:crypto，不引入厂商 SDK。
 * 注意：Content-Type 参与签名，客户端 PUT 时必须发送相同的 Content-Type 头。
 */
function ossPresignedPutUrl(
  objectKey: string,
  region: string,
  bucket: string,
  secretId: string,
  secretKey: string,
  mimeType: string
): { uploadUrl: string; host: string } {
  const host = `${bucket}.${region}.aliyuncs.com`;
  const expires = Math.floor(Date.now() / 1000) + 600; // 10 分钟有效期（unix 秒）
  const resource = `/${bucket}/${objectKey}`;
  // VERB\nCONTENT-MD5(空)\nCONTENT-TYPE\nEXPIRES\nCanonicalizedResource
  const stringToSign = `PUT\n\n${mimeType}\n${expires}\n${resource}`;
  const signature = createHmac('sha1', secretKey).update(stringToSign).digest('base64');
  const encodedKey = objectKey.split('/').map(encodeURIComponent).join('/');
  const uploadUrl =
    `https://${host}/${encodedKey}` +
    `?OSSAccessKeyId=${encodeURIComponent(secretId)}` +
    `&Expires=${expires}&Signature=${encodeURIComponent(signature)}`;
  return { uploadUrl, host };
}

// ── disk provider（本服务器磁盘存储，私用自托管，免 COS）─────────────────
// 上传 PUT 走本服务 /api/media/upload?key&exp&sig（短时 HMAC 签名鉴权，免登录头）；
// 读取走 /files/<objectKey> 静态返回。secret 优先用 STORAGE_ACCESS_KEY_SECRET，
// 未配置时从 JWT_SECRET 派生专用密钥，避免直接复用 JWT 密钥跨信任域。

const EXT_CONTENT_TYPE: Record<string, string> = {
  jpg: 'image/jpeg',
  png: 'image/png',
  webp: 'image/webp',
  gif: 'image/gif',
};

let cachedDiskSecret: string | null = null;

function diskSecret(): string {
  if (cachedDiskSecret === null) {
    cachedDiskSecret =
      process.env.STORAGE_ACCESS_KEY_SECRET?.trim() ||
      createHmac('sha256', config.jwtSecret).update('disk-upload-v1').digest('hex');
  }
  return cachedDiskSecret;
}

function signDisk(objectKey: string, exp: number): string {
  return createHmac('sha256', diskSecret()).update(`${objectKey}\n${exp}`).digest('hex');
}

/** 校验 disk 上传签名（未过期且签名匹配）。 */
export function verifyDiskUploadToken(objectKey: string, exp: number, sig: string): boolean {
  if (!Number.isFinite(exp) || exp * 1000 < Date.now()) return false;
  const expected = Buffer.from(signDisk(objectKey, exp));
  const actual = Buffer.from(sig || '');
  // 长度一致再做常量时间比较，避免抛错与时序侧信道
  return expected.length === actual.length && timingSafeEqual(expected, actual);
}

/** disk 存储根目录（绝对路径）。 */
export function diskRootDir(): string {
  return path.resolve(config.storageDiskDir);
}

/** 把 objectKey 解析为磁盘绝对路径，并防目录穿越（必须落在根目录内）。 */
export function diskFilePath(objectKey: string): string | null {
  const root = diskRootDir();
  const target = path.resolve(root, objectKey);
  if (target !== root && !target.startsWith(root + path.sep)) return null;
  return target;
}

/** 由文件名扩展名推断 Content-Type（静态返回用）。 */
export function contentTypeForKey(objectKey: string): string {
  const ext = objectKey.split('.').pop()?.toLowerCase() ?? '';
  return EXT_CONTENT_TYPE[ext] ?? 'application/octet-stream';
}

/**
 * 签发一次上传凭证。校验类型；按 provider 返回直传信息。
 * COS / OSS 预签名均已用 node:crypto 实现，无需厂商 SDK。
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
    case 'cos': {
      const { secretId, secretKey } = requireCloudStorageKeys('COS');
      const { uploadUrl, host } = cosPresignedPutUrl(
        objectKey,
        config.storageRegion,
        config.storageBucket,
        secretId,
        secretKey
      );
      return { ...base, fileUrl: cloudFileUrl(objectKey, host), uploadUrl };
    }
    case 'oss': {
      const { secretId, secretKey } = requireCloudStorageKeys('OSS');
      const { uploadUrl, host } = ossPresignedPutUrl(
        objectKey,
        config.storageRegion,
        config.storageBucket,
        secretId,
        secretKey,
        mimeType
      );
      return { ...base, fileUrl: cloudFileUrl(objectKey, host), uploadUrl };
    }
    case 'disk': {
      // 本服务器磁盘存储：上传走本服务签名 PUT，读取走 /files 静态返回。免 COS。
      const publicBase = strippedPublicBase();
      if (!publicBase) {
        throw new AppError(
          'STORAGE_NOT_CONFIGURED',
          'disk provider requires STORAGE_PUBLIC_BASE_URL (本服务可访问的基础地址，如 http://localhost:3000).',
          500
        );
      }
      const exp = Math.floor(Date.now() / 1000) + 600; // 10 分钟
      const sig = signDisk(objectKey, exp);
      const uploadUrl = `${publicBase}/api/media/upload?key=${encodeURIComponent(objectKey)}&exp=${exp}&sig=${sig}`;
      const fileUrl = `${publicBase}/files/${objectKey}`;
      return { ...base, fileUrl, uploadUrl };
    }
    default:
      throw new AppError(
        'STORAGE_PROVIDER_UNKNOWN',
        `Unknown storage provider: ${config.storageProvider}.`,
        500
      );
  }
}
