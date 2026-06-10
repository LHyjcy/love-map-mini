/**
 * 高德地图 Provider（预留）。key 从 process.env.AMAP_KEY 读取。
 * 目前为桩实现：无 key 抛 MAP_NOT_CONFIGURED；distance 用 Haversine 兜底。
 * TODO: 接入高德 WebService（restapi.amap.com）实现 reverseGeocode/search/suggestion/route。
 */
import { AppError } from '../../utils/errors.js';
import {
  type LatLng,
  type MapProvider,
  type PoiItem,
  type ReverseGeocodeResult,
  haversineDistance,
} from './MapProvider.js';

function notConfigured(): never {
  throw new AppError('MAP_NOT_CONFIGURED', '高德地图 key 未配置（AMAP_KEY），且高德 Provider 尚未实现。', 501);
}

export class AmapProvider implements MapProvider {
  name = 'amap';

  async reverseGeocode(_lat: number, _lng: number): Promise<ReverseGeocodeResult> {
    return notConfigured();
  }
  async searchPoi(_keyword: string, _opts?: { lat?: number; lng?: number }): Promise<{ pois: PoiItem[] }> {
    return notConfigured();
  }
  async suggestKeyword(_keyword: string): Promise<{ keywords: string[] }> {
    return notConfigured();
  }
  async distance(from: LatLng, to: LatLng): Promise<{ distanceMeters: number; mode: string }> {
    return haversineDistance(from, to);
  }
  async routePlan(): Promise<{ distanceMeters: number; durationSeconds: number; polyline?: string }> {
    return notConfigured();
  }
  async coordinateConvert(
    lat: number,
    lng: number,
    _fromType: string,
    toType: string
  ): Promise<{ latitude: number; longitude: number; coordType: string }> {
    return { latitude: lat, longitude: lng, coordType: toType };
  }
}
