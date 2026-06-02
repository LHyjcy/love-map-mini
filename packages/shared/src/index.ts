/**
 * @love-map-mini/shared
 * 跨端共享的类型、枚举与契约。随 Phase 推进逐步补充。
 */

export const PROJECT_NAME = 'love-map-mini';

// ---------------------------------------------------------------------------
// 统一 API 响应类型（与 apps/api/src/utils/response.ts 保持一致）
// ---------------------------------------------------------------------------

export interface SuccessResponse<T> {
  success: true;
  data: T;
}

export interface ErrorResponse {
  success: false;
  error: { code: string; message: string };
}

export type ApiResponse<T> = SuccessResponse<T> | ErrorResponse;

// ---------------------------------------------------------------------------
// 枚举（与 Prisma schema 对应）
// ---------------------------------------------------------------------------

export type Gender = 'unknown' | 'male' | 'female';
export type CoupleStatus = 'pending' | 'active' | 'unbound';

// ---------------------------------------------------------------------------
// Phase 4：认证与情侣绑定 DTO
// ---------------------------------------------------------------------------

export interface PublicUser {
  id: string;
  nickname: string;
  avatarUrl: string | null;
  gender: Gender;
  birthday: string | null;
  createdAt: string;
}

export interface PublicPartner {
  id: string;
  nickname: string;
  avatarUrl: string | null;
  gender: Gender;
}

export interface AuthLoginResult {
  token: string;
  user: PublicUser;
}

export interface CoupleView {
  id: string;
  userAId: string;
  userBId: string | null;
  status: CoupleStatus;
  togetherAt: string | null;
  createdAt: string;
}

export interface CoupleInviteResult {
  id: string;
  status: CoupleStatus;
  inviteCode: string;
  inviteExpiresAt: string | null;
}

export interface MockLoginInput {
  nickname: string;
  mockId: string;
  avatarUrl?: string;
  gender?: Gender;
}

export interface AcceptInviteInput {
  inviteCode: string;
}
