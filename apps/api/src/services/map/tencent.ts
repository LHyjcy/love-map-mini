/**
 * 腾讯位置服务 Provider。key 从 process.env.TENCENT_MAP_KEY 读取（仅后端）。
 * 无 key：网络类方法抛 MAP_NOT_CONFIGURED；distance 用 Haversine；坐标转换做恒等兜底。
 */
import { AppError } from '../../utils/errors.js';
import {
  type LatLng,
  type MapProvider,
  type PoiItem,
  type ReverseGeocodeResult,
  haversineDistance,
} from './MapProvider.js';

const BASE = 'https://apis.map.qq.com';

function keyOrThrow(): string {
  const key = process.env.TENCENT_MAP_KEY?.trim();
  if (!key) {
    throw new AppError('MAP_NOT_CONFIGURED', '腾讯地图 key 未配置（TENCENT_MAP_KEY）。', 501);
  }
  return key;
}

async function getJson(url: string): Promise<any> {
  try {
    const res = await fetch(url);
    if (!res.ok) {
      throw new AppError('MAP_UPSTREAM_ERROR', `地图服务返回 ${res.status}`, 502);
    }
    const data = (await res.json()) as { status?: number; message?: string };
    if (typeof data.status === 'number' && data.status !== 0) {
      throw new AppError('MAP_UPSTREAM_ERROR', `地图服务错误：${data.message ?? data.status}`, 502);
    }
    return data;
  } catch (err) {
    if (err instanceof AppError) throw err;
    throw new AppError('MAP_UPSTREAM_ERROR', '地图服务请求失败。', 502);
  }
}

export class TencentMapProvider implements MapProvider {
  name = 'tencent';

  async reverseGeocode(lat: number, lng: number): Promise<ReverseGeocodeResult> {
    const key = keyOrThrow();
    const url = `${BASE}/ws/geocoder/v1/?location=${lat},${lng}&key=${key}`;
    const data = await getJson(url);
    const r = data.result ?? {};
    const ad = r.ad_info ?? {};
    return {
      address: r.address ?? '',
      provinceId: ad.adcode ? String(ad.adcode).slice(0, 2) + '0000' : undefined,
      cityId: ad.city_code ? undefined : ad.adcode ? String(ad.adcode).slice(0, 4) + '00' : undefined,
      raw: r,
    };
  }

  async searchPoi(keyword: string, opts?: { lat?: number; lng?: number }): Promise<{ pois: PoiItem[] }> {
    const key = keyOrThrow();
    const boundary =
      opts?.lat != null && opts?.lng != null
        ? `&boundary=nearby(${opts.lat},${opts.lng},5000)`
        : '&boundary=region(全国,0)';
    const url = `${BASE}/ws/place/v1/search?keyword=${encodeURIComponent(keyword)}${boundary}&key=${key}`;
    const data = await getJson(url);
    const pois: PoiItem[] = (data.data ?? []).map((p: any) => ({
      title: p.title ?? '',
      address: p.address ?? '',
      latitude: p.location?.lat ?? 0,
      longitude: p.location?.lng ?? 0,
    }));
    return { pois };
  }

  async suggestKeyword(keyword: string): Promise<{ keywords: string[] }> {
    const key = keyOrThrow();
    const url = `${BASE}/ws/place/v1/suggestion?keyword=${encodeURIComponent(keyword)}&key=${key}`;
    const data = await getJson(url);
    const keywords: string[] = (data.data ?? []).map((s: any) => s.title ?? '').filter(Boolean);
    return { keywords };
  }

  async distance(from: LatLng, to: LatLng): Promise<{ distanceMeters: number; mode: string }> {
    // 直线距离无需 key；有 key 时也直接用 Haversine 兜底，避免额外配额消耗。
    return haversineDistance(from, to);
  }

  async routePlan(
    from: LatLng,
    to: LatLng,
    mode = 'driving'
  ): Promise<{ distanceMeters: number; durationSeconds: number; polyline?: string }> {
    const key = keyOrThrow();
    const url = `${BASE}/ws/direction/v1/${mode}/?from=${from.lat},${from.lng}&to=${to.lat},${to.lng}&key=${key}`;
    const data = await getJson(url);
    const route = data.result?.routes?.[0] ?? {};
    return {
      distanceMeters: route.distance ?? 0,
      durationSeconds: route.duration != null ? route.duration * 60 : 0,
      polyline: undefined,
    };
  }

  async coordinateConvert(
    lat: number,
    lng: number,
    fromType: string,
    toType: string
  ): Promise<{ latitude: number; longitude: number; coordType: string }> {
    // gcj02 与微信/腾讯一致；同坐标系或缺 key 时恒等返回。真实跨坐标系转换待接入 key 后用 translate 接口。
    if (fromType === toType) {
      return { latitude: lat, longitude: lng, coordType: toType };
    }
    return { latitude: lat, longitude: lng, coordType: toType };
  }
}
