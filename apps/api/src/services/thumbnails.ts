/**
 * disk 模式照片缩略图（sharp）。
 * 列表/卡片场景用小图，显著降低小程序端流量与加载时间；详情大图与
 * wx.previewImage 仍用原图。原图是唯一持久来源——缩略图可随时由原图
 * 重建，丢失/删除无害，因此不入库、不参与备份语义（备份脚本会顺带打包）。
 */
import { promises as fs } from 'node:fs';
import path from 'node:path';
import sharp from 'sharp';
import { diskFilePath, diskThumbPath } from './storage.js';

/** 缩略图最长边（px）。小程序卡片在 2~3 倍屏下 640 足够清晰。 */
const THUMB_MAX_DIM = 640;
/** JPEG 输出质量。 */
const THUMB_JPEG_QUALITY = 75;

/**
 * 确保某对象的缩略图存在并返回其磁盘路径：已有直接返回；没有则从原图
 * 现场生成（历史照片首次被请求时惰性补齐，无需回填脚本）。
 * 原图缺失或解码失败时返回 null，调用方回退到原图。
 */
export async function ensureThumb(objectKey: string): Promise<string | null> {
  const thumbPath = diskThumbPath(objectKey);
  const originPath = diskFilePath(objectKey);
  if (!thumbPath || !originPath) return null;
  try {
    await fs.access(thumbPath);
    return thumbPath;
  } catch {
    // 还没有缩略图，往下生成
  }
  try {
    const buf = await sharp(originPath)
      // 按 EXIF 矫正方向（缩略图不再携带 EXIF，需要烘焙进像素）
      .rotate()
      // 统一输出 JPEG：透明背景铺白
      .flatten({ background: '#ffffff' })
      .resize(THUMB_MAX_DIM, THUMB_MAX_DIM, { fit: 'inside', withoutEnlargement: true })
      .jpeg({ quality: THUMB_JPEG_QUALITY })
      .toBuffer();
    await fs.mkdir(path.dirname(thumbPath), { recursive: true });
    await fs.writeFile(thumbPath, buf);
    return thumbPath;
  } catch {
    // 原图不存在或不是可解码图片：交给调用方回退原图
    return null;
  }
}

/** 删除某对象的缩略图（照片删除时连带清理；不存在/失败忽略）。 */
export async function removeThumb(objectKey: string): Promise<void> {
  const thumbPath = diskThumbPath(objectKey);
  if (!thumbPath) return;
  try {
    await fs.unlink(thumbPath);
  } catch {
    // 缩略图可能从未生成过
  }
}
