/**
 * 百度地图 Provider（预留）。AK 从 process.env.BAIDU_MAP_AK 读取。
 * 目前为桩实现：无 AK 抛 MAP_NOT_CONFIGURED；distance 用 Haversine 兜底。
 *
 * TODO: 百度使用 BD-09 坐标系，与本项目默认的 GCJ-02 不一致。
 *       接入百度前必须实现 BD-09 <-> GCJ-02 双向转换，
 *       入参先 GCJ-02->BD-09 调用百度，返回再 BD-09->GCJ-02 落库，避免坐标漂移。
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
  throw new AppError('MAP_NOT_CONFIGURED', '百度地图 AK 未配置（BAIDU_MAP_AK），且百度 Provider 尚未实现。', 501);
}

export class BaiduProvider implements MapProvider {
  name = 'baidu';

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
    // TODO: 实现 BD-09 <-> GCJ-02 转换；当前恒等兜底。
    return { latitude: lat, longitude: lng, coordType: toType };
  }
}
