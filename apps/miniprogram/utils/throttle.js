// utils/throttle.js — 位置上传节流：最小间隔 10s、最小移动 30m；低精度(>100m)不上传。
// 纯前端计算，配合主动共享使用，避免高频上报与无意义点位。

const MIN_INTERVAL_MS = 10000
const MIN_DISTANCE_M = 30
const MAX_ACCURACY_M = 100

// Haversine 直线距离（米）。
function haversineMeters(lat1, lng1, lat2, lng2) {
  const R = 6371000
  const toRad = (d) => (d * Math.PI) / 180
  const dLat = toRad(lat2 - lat1)
  const dLng = toRad(lng2 - lng1)
  const a =
    Math.sin(dLat / 2) * Math.sin(dLat / 2) +
    Math.cos(toRad(lat1)) * Math.cos(toRad(lat2)) * Math.sin(dLng / 2) * Math.sin(dLng / 2)
  return 2 * R * Math.asin(Math.sqrt(a))
}

// 判断本次定位是否应上传。
// last: { latitude, longitude, time(ms) } | null；cur: { latitude, longitude, accuracy }
// 返回 { upload: boolean, reason: string }
function decideUpload(last, cur) {
  if (typeof cur.accuracy === 'number' && cur.accuracy > MAX_ACCURACY_M) {
    return { upload: false, reason: 'low_accuracy' }
  }
  if (!last) {
    return { upload: true, reason: 'first' }
  }
  const now = Date.now()
  if (now - last.time < MIN_INTERVAL_MS) {
    return { upload: false, reason: 'interval' }
  }
  const moved = haversineMeters(last.latitude, last.longitude, cur.latitude, cur.longitude)
  if (moved < MIN_DISTANCE_M) {
    return { upload: false, reason: 'distance' }
  }
  return { upload: true, reason: 'moved' }
}

module.exports = { haversineMeters, decideUpload, MIN_INTERVAL_MS, MIN_DISTANCE_M, MAX_ACCURACY_M }
