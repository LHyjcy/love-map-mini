/**
 * MapProvider 工厂 + 逆地址缓存。
 * 按 MAP_PROVIDER 选择默认 Provider（默认 tencent）。
 * reverseGeocodeCached：按经纬度（保留 4 位小数）做进程内缓存，
 * 避免对同一位置重复调用上游（位置更新本就不触发逆地址，这里再加一层去重）。
 */
import { AmapProvider } from './amap.js';
import { BaiduProvider } from './baidu.js';
import type { MapProvider, ReverseGeocodeResult } from './MapProvider.js';
import { TencentMapProvider } from './tencent.js';

let singleton: MapProvider | null = null;

export function getMapProvider(): MapProvider {
  if (singleton) return singleton;
  const name = (process.env.MAP_PROVIDER ?? 'tencent').toLowerCase();
  if (name === 'amap') singleton = new AmapProvider();
  else if (name === 'baidu') singleton = new BaiduProvider();
  else singleton = new TencentMapProvider();
  return singleton;
}

const reverseCache = new Map<string, ReverseGeocodeResult>();

function roundKey(lat: number, lng: number): string {
  return `${lat.toFixed(4)},${lng.toFixed(4)}`;
}

export async function reverseGeocodeCached(lat: number, lng: number): Promise<ReverseGeocodeResult> {
  const key = roundKey(lat, lng);
  const hit = reverseCache.get(key);
  if (hit) return hit;
  const result = await getMapProvider().reverseGeocode(lat, lng);
  reverseCache.set(key, result);
  return result;
}
