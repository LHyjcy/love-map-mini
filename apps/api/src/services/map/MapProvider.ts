/**
 * 地图服务适配层接口（MapProvider）。
 * 设计：地图服务商仅用于逆地址解析、POI 搜索、距离/路线、坐标转换，
 * 不参与实时位置同步。所有 key 仅从后端环境变量读取，绝不返回前端、绝不记日志。
 * 无 key 时：网络类方法抛 MAP_NOT_CONFIGURED(501)，distance 用 Haversine 兜底，
 * coordinateConvert 在同坐标系/简单情形下做恒等返回。
 */
import { haversineMeters } from '../../utils/geo.js';

export interface LatLng {
  lat: number;
  lng: number;
}

export interface ReverseGeocodeResult {
  address: string;
  provinceId?: string;
  cityId?: string;
  raw?: unknown;
}

export interface PoiItem {
  title: string;
  address: string;
  latitude: number;
  longitude: number;
}

export interface MapProvider {
  name: string;
  reverseGeocode(lat: number, lng: number): Promise<ReverseGeocodeResult>;
  searchPoi(keyword: string, opts?: { lat?: number; lng?: number }): Promise<{ pois: PoiItem[] }>;
  suggestKeyword(keyword: string): Promise<{ keywords: string[] }>;
  distance(from: LatLng, to: LatLng): Promise<{ distanceMeters: number; mode: string }>;
  routePlan(
    from: LatLng,
    to: LatLng,
    mode?: string
  ): Promise<{ distanceMeters: number; durationSeconds: number; polyline?: string }>;
  coordinateConvert(
    lat: number,
    lng: number,
    fromType: string,
    toType: string
  ): Promise<{ latitude: number; longitude: number; coordType: string }>;
}

/** 所有 Provider 共用的直线距离兜底（无需任何 key）。 */
export function haversineDistance(from: LatLng, to: LatLng): { distanceMeters: number; mode: string } {
  return { distanceMeters: Math.round(haversineMeters(from.lat, from.lng, to.lat, to.lng)), mode: 'straight' };
}
