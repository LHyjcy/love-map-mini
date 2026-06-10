// utils/geo-canvas.js — 足迹地图 canvas 工具：GeoJSON 投影、绘制、点击命中。
// 借鉴 map-of-us 的「省/市点亮」思路，自行实现等距圆柱投影 + 多边形填充 + 射线法命中。
// 不依赖 d3/Leaflet（小程序内不可用）。坐标按经纬度线性映射到画布，保持等比、居中。

// 计算 features 的经纬度边界。
function computeBounds(features) {
  let minLng = Infinity, maxLng = -Infinity, minLat = Infinity, maxLat = -Infinity
  eachRing(features, (ring) => {
    for (let i = 0; i < ring.length; i++) {
      const lng = ring[i][0], lat = ring[i][1]
      if (lng < minLng) minLng = lng
      if (lng > maxLng) maxLng = lng
      if (lat < minLat) minLat = lat
      if (lat > maxLat) maxLat = lat
    }
  })
  return { minLng, maxLng, minLat, maxLat }
}

// 遍历所有 feature 的所有环（Polygon / MultiPolygon 兼容）。
function eachRing(features, cb) {
  for (const f of features) {
    const g = f && f.geometry
    if (!g) continue
    if (g.type === 'Polygon') {
      for (const ring of g.coordinates) cb(ring, f)
    } else if (g.type === 'MultiPolygon') {
      for (const poly of g.coordinates) for (const ring of poly) cb(ring, f)
    }
  }
}

// 构建投影器：把 (lng,lat) 映射到画布像素 [x,y]，等比居中，上北。
function makeProjector(features, width, height, pad) {
  const b = computeBounds(features)
  const padding = pad || 12
  const w = width - padding * 2
  const h = height - padding * 2
  const spanLng = (b.maxLng - b.minLng) || 1
  const spanLat = (b.maxLat - b.minLat) || 1
  const scale = Math.min(w / spanLng, h / spanLat)
  const offsetX = padding + (w - spanLng * scale) / 2
  const offsetY = padding + (h - spanLat * scale) / 2
  function project(lng, lat) {
    const x = offsetX + (lng - b.minLng) * scale
    const y = offsetY + (b.maxLat - lat) * scale // 纬度翻转：北在上
    return [x, y]
  }
  return { project, bounds: b }
}

// 绘制所有省/市：点亮用主题色，未点亮用浅灰；统一描边。
function draw(ctx, features, projector, opts) {
  const litSet = (opts && opts.litSet) || new Set()
  const litColor = (opts && opts.litColor) || '#544487'
  const baseColor = (opts && opts.baseColor) || '#ece9f6'
  const strokeColor = (opts && opts.strokeColor) || '#ffffff'
  ctx.lineWidth = 1
  for (const f of features) {
    const adcode = String((f.properties && f.properties.adcode) || '')
    ctx.fillStyle = litSet.has(adcode) ? litColor : baseColor
    ctx.strokeStyle = strokeColor
    drawFeaturePath(ctx, f, projector)
    ctx.fill()
    ctx.stroke()
  }
}

function drawFeaturePath(ctx, feature, projector) {
  ctx.beginPath()
  const g = feature.geometry
  const polys = g.type === 'Polygon' ? [g.coordinates] : g.type === 'MultiPolygon' ? g.coordinates : []
  for (const poly of polys) {
    for (const ring of poly) {
      for (let i = 0; i < ring.length; i++) {
        const p = projector.project(ring[i][0], ring[i][1])
        if (i === 0) ctx.moveTo(p[0], p[1])
        else ctx.lineTo(p[0], p[1])
      }
      ctx.closePath()
    }
  }
}

// 射线法：点 (px,py) 是否在投影后的环内。
function pointInRing(px, py, ring, projector) {
  let inside = false
  for (let i = 0, j = ring.length - 1; i < ring.length; j = i++) {
    const a = projector.project(ring[i][0], ring[i][1])
    const b = projector.project(ring[j][0], ring[j][1])
    const xi = a[0], yi = a[1], xj = b[0], yj = b[1]
    const intersect = (yi > py) !== (yj > py) && px < ((xj - xi) * (py - yi)) / (yj - yi) + xi
    if (intersect) inside = !inside
  }
  return inside
}

// 命中测试：返回被点中 feature 的 adcode（字符串）或 null。
function hitTest(features, projector, px, py) {
  for (const f of features) {
    const g = f && f.geometry
    if (!g) continue
    const polys = g.type === 'Polygon' ? [g.coordinates] : g.type === 'MultiPolygon' ? g.coordinates : []
    for (const poly of polys) {
      // 只测外环（poly[0]）。
      if (poly[0] && pointInRing(px, py, poly[0], projector)) {
        return String((f.properties && f.properties.adcode) || '')
      }
    }
  }
  return null
}

module.exports = { computeBounds, makeProjector, draw, hitTest }
