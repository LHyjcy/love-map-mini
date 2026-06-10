/**
 * 公开地图分享页（只读，免登录）。
 * 从 URL 查询参数 ?code=<shareCode> 读取分享码，
 * 调用后端 GET {API_BASE}/api/public-map/:shareCode 渲染地图与列表。
 *
 * 后端约定（见 apps/api/src/routes/publicMap.ts）：
 *   成功: { success:true, data:{ share:{title}, places:[...], memories:[...], footprint:{...} } }
 *   失败/未找到/已关闭: HTTP 404 + { success:false, error:{code,message} }
 * 坐标已在服务端模糊化（~3 位小数），本页不做任何精确定位。
 *
 * 两种视图共享同一次 fetch 的数据：
 *   - 地点地图：在底图上渲染公开地点 marker（默认）。
 *   - 足迹地图：加载中国省级行政区划 GeoJSON，按 footprint.litProvinceIds 点亮。
 */

// API 源地址来自运行时配置 config.js（window.LOVE_MAP_CONFIG.API_BASE）。
const API_BASE =
  (window.LOVE_MAP_CONFIG && window.LOVE_MAP_CONFIG.API_BASE) || 'http://localhost:3000';

const DEFAULT_CENTER = [39.9087, 116.3975];
const DEFAULT_ZOOM = 4;

// 全国省级行政区划边界 GeoJSON（公开 CDN，浏览器可直接 fetch）。
const CHINA_PROVINCES_GEOJSON =
  'https://geo.datav.aliyun.com/areas_v3/bound/100000_full.json';

const FOOTPRINT_LIT_COLOR = '#e8517f';
const FOOTPRINT_DIM_COLOR = '#e6e6ea';

const PLACE_TYPE_LABELS = { visited: '已去过', wishlist: '想去', plan: '计划中' };

function placeTypeLabel(type) {
  return PLACE_TYPE_LABELS[type] || type || '';
}

function getShareCode() {
  return new URLSearchParams(window.location.search).get('code');
}

function escapeHtml(value) {
  if (value === null || value === undefined) return '';
  return String(value)
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&#39;');
}

function formatDate(value) {
  if (!value) return '';
  const d = new Date(value);
  if (Number.isNaN(d.getTime())) return '';
  const y = d.getFullYear();
  const m = String(d.getMonth() + 1).padStart(2, '0');
  const day = String(d.getDate()).padStart(2, '0');
  return `${y}-${m}-${day}`;
}

function showError(message) {
  const banner = document.getElementById('error-banner');
  banner.textContent = message || '分享不存在或已关闭';
  banner.hidden = false;
}

// ── 状态 ─────────────────────────────────────────────
let map;
let markersLayer; // 地点 marker 图层组
let footprintLayer = null; // 省份 GeoJSON 图层（懒加载）
let provincesGeoCache = null; // 省界 GeoJSON 缓存
let footprintInfo = { litProvinceIds: [], litCityIds: [], provinceCount: 0, cityCount: 0 };
let placeLatLngs = [];
let currentView = 'markers';

function initMap() {
  map = L.map('map').setView(DEFAULT_CENTER, DEFAULT_ZOOM);
  L.tileLayer('https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png', {
    maxZoom: 19,
    attribution: '&copy; OpenStreetMap contributors',
  }).addTo(map);
  markersLayer = L.layerGroup().addTo(map);
}

function renderMarkers(places) {
  placeLatLngs = [];
  markersLayer.clearLayers();
  places.forEach((p) => {
    if (typeof p.latitude !== 'number' || typeof p.longitude !== 'number') return;
    const marker = L.marker([p.latitude, p.longitude]);
    const popupHtml = [
      `<strong>${escapeHtml(p.title)}</strong>`,
      `<div>${escapeHtml(placeTypeLabel(p.placeType))}</div>`,
      p.city ? `<div>${escapeHtml(p.city)}</div>` : '',
    ].join('');
    marker.bindPopup(popupHtml);
    marker.addTo(markersLayer);
    placeLatLngs.push([p.latitude, p.longitude]);
  });
}

function fitToPlaces() {
  if (placeLatLngs.length > 0) {
    map.fitBounds(placeLatLngs, { padding: [40, 40], maxZoom: 14 });
  } else {
    map.setView(DEFAULT_CENTER, DEFAULT_ZOOM);
  }
}

function renderPlaces(places) {
  document.getElementById('places-count').textContent = String(places.length);
  const list = document.getElementById('places-list');
  if (places.length === 0) {
    list.innerHTML = '<li class="empty">暂无公开地点</li>';
    return;
  }
  list.innerHTML = places
    .map((p) => {
      const meta = [placeTypeLabel(p.placeType), p.city].filter(Boolean).map(escapeHtml).join(' · ');
      return `<li class="list-item"><span class="item-title">${escapeHtml(p.title)}</span><span class="item-meta">${meta}</span></li>`;
    })
    .join('');
}

function renderMemories(memories) {
  document.getElementById('memories-count').textContent = String(memories.length);
  const list = document.getElementById('memories-list');
  if (memories.length === 0) {
    list.innerHTML = '<li class="empty">暂无公开回忆</li>';
    return;
  }
  list.innerHTML = memories
    .map((m) => {
      const date = formatDate(m.memoryDate);
      return `<li class="list-item"><span class="item-title">${escapeHtml(m.title)}</span><span class="item-meta">${escapeHtml(date)}</span></li>`;
    })
    .join('');
}

function applyShareTitle(title) {
  const safeTitle = title || '情侣地图';
  document.title = `${safeTitle} · 公开分享`;
  document.getElementById('share-title').textContent = safeTitle;
}

// ── 足迹视图 ─────────────────────────────────────────
async function buildFootprintLayer() {
  if (!provincesGeoCache) {
    const res = await fetch(CHINA_PROVINCES_GEOJSON);
    provincesGeoCache = await res.json();
  }
  const litSet = new Set((footprintInfo.litProvinceIds || []).map(String));
  return L.geoJSON(provincesGeoCache, {
    style: (feature) => {
      const adcode = String((feature.properties && feature.properties.adcode) || '');
      const lit = litSet.has(adcode);
      return {
        color: '#ffffff',
        weight: 1,
        fillColor: lit ? FOOTPRINT_LIT_COLOR : FOOTPRINT_DIM_COLOR,
        fillOpacity: lit ? 0.85 : 0.5,
      };
    },
    onEachFeature: (feature, layer) => {
      const name = (feature.properties && feature.properties.name) || '';
      const adcode = String((feature.properties && feature.properties.adcode) || '');
      const lit = litSet.has(adcode);
      if (name) layer.bindTooltip(name + (lit ? ' · 已点亮' : ''), { sticky: true });
    },
  });
}

async function showFootprintView() {
  const caption = document.getElementById('footprint-caption');
  caption.hidden = false;
  caption.textContent = '加载省份边界…';
  try {
    if (markersLayer) map.removeLayer(markersLayer);
    if (!footprintLayer) footprintLayer = await buildFootprintLayer();
    footprintLayer.addTo(map);
    try { map.fitBounds(footprintLayer.getBounds(), { padding: [20, 20] }); } catch (e) { /* 忽略 */ }
    caption.textContent = `点亮 ${footprintInfo.provinceCount || 0} 省 · ${footprintInfo.cityCount || 0} 市（仅公开内容）`;
  } catch (err) {
    caption.textContent = '省份边界加载失败';
  }
}

function showMarkersView() {
  document.getElementById('footprint-caption').hidden = true;
  if (footprintLayer) map.removeLayer(footprintLayer);
  if (markersLayer) markersLayer.addTo(map);
  fitToPlaces();
}

function setActiveTab(view) {
  currentView = view;
  const tabM = document.getElementById('tab-markers');
  const tabF = document.getElementById('tab-footprint');
  const isM = view === 'markers';
  tabM.classList.toggle('is-active', isM);
  tabF.classList.toggle('is-active', !isM);
  tabM.setAttribute('aria-selected', String(isM));
  tabF.setAttribute('aria-selected', String(!isM));
}

function setupTabs() {
  document.getElementById('tab-markers').addEventListener('click', () => {
    if (currentView === 'markers') return;
    setActiveTab('markers');
    showMarkersView();
  });
  document.getElementById('tab-footprint').addEventListener('click', () => {
    if (currentView === 'footprint') return;
    setActiveTab('footprint');
    showFootprintView();
  });
}

async function load() {
  initMap();
  setupTabs();

  const code = getShareCode();
  if (!code) {
    showError('缺少分享码，请使用形如 ?code=xxxx 的链接访问');
    return;
  }

  let res;
  try {
    res = await fetch(`${API_BASE}/api/public-map/${encodeURIComponent(code)}`);
  } catch (err) {
    showError('无法连接服务器，请稍后再试');
    return;
  }
  if (!res.ok) {
    showError('分享不存在或已关闭');
    return;
  }

  let payload;
  try {
    payload = await res.json();
  } catch (err) {
    showError('数据解析失败，请稍后再试');
    return;
  }
  if (!payload || payload.success !== true || !payload.data) {
    showError('分享不存在或已关闭');
    return;
  }

  const { share, places = [], memories = [], footprint } = payload.data;
  footprintInfo = footprint || footprintInfo;
  applyShareTitle(share && share.title);
  renderMarkers(places);
  renderPlaces(places);
  renderMemories(memories);
  fitToPlaces();
}

window.addEventListener('DOMContentLoaded', load);
