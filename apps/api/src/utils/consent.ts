/**
 * 隐私授权（PrivacyConsent）联动工具。
 *
 * 设计（隐私优先，见 CLAUDE.md / docs/PRIVACY.md）：
 * - 「行为即授权」：用户主动发起共享类动作（向伴侣共享打卡、开启临时位置共享、
 *   开启公开地图）时，自动补记一条对应类型的同意记录，保证授权台账与实际行为一致。
 * - 授权台账为追加写（append-only）：仅当“最新一条不是同意”时才补记，避免刷行。
 * - 撤销联动在 routes/privacy.ts 中实现（撤销 location 即停止生效中的共享会话等）。
 */
import { prisma } from '../db.js';

/** 行为隐含授权时写入的版本号，便于在台账中区分手动勾选与行为补记。 */
const ACTION_IMPLIED_VERSION = 'action-implied-v1';

export type ConsentType = 'location' | 'album' | 'camera' | 'public_share';

/**
 * 确保某类授权的最新状态为「同意」；若最新一条已是同意则不重复写。
 * 即发即忘语义由调用方决定（建议 await，失败不应阻断主流程时再自行吞错）。
 */
export async function recordConsentGranted(userId: string, consentType: ConsentType): Promise<void> {
  const latest = await prisma.privacyConsent.findFirst({
    where: { userId, consentType },
    orderBy: { createdAt: 'desc' },
    select: { agreedAt: true },
  });
  if (latest?.agreedAt) {
    return; // 最新状态已是同意，无需补记
  }
  await prisma.privacyConsent.create({
    data: {
      userId,
      consentType,
      version: ACTION_IMPLIED_VERSION,
      agreedAt: new Date(),
      revokedAt: null,
    },
  });
}
