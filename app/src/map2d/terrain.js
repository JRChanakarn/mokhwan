/**
 * terrain — แสดงภูมิประเทศในโหมด 2D ใต้ชั้นควัน (HANDOFF ข้อ 3)
 *
 * ส่วนบริสุทธิ์ (ทดสอบใน node): hillshadeRGBA · contourLevels · terrainContourGeoJSON
 * ส่วน Leaflet บางๆ: showTerrain / clearTerrain
 *
 * ลำดับชั้น: pane ของตัวเอง `terrainPane` zIndex 350 ต่ำกว่า overlayPane (400) ทั้ง hillshade
 * และเส้นชั้นความสูงอยู่ในนี้ → ควัน (rasterL) และเส้นชั้น*ความเข้มข้น* (gCont) อยู่บนเสมอ
 *
 * พิกัดเส้นชั้น: ใช้สูตรเดียวกับเส้นชั้นความเข้มข้นใน drawOverlay คำต่อคำ
 *   x = cx − R + pt[0]·cell · y = cy + R − pt[1]·cell · toLL(x, y, origin)
 * ไม่งั้นเส้นชั้นความสูงจะเลื่อนเทียบกับควันครึ่งเซลล์
 */
import * as d3 from 'd3';

/**
 * Hillshade แบบ Horn · แสงจาก azDeg (315 = ตะวันตกเฉียงเหนือ) สูง altDeg
 * คืน RGBA: พื้นราบโปร่งใส · ด้านรับแสงขาวโปร่ง · ด้านเงาดำโปร่ง ให้ basemap ยังอ่านออก
 * elev เรียงแบบกริดเอนจิน (แถว j=0 เหนือ · ดัชนี j*N+i)
 */
export function hillshadeRGBA(elev, N, cell, { azDeg = 315, altDeg = 45, exag = 1, maxAlpha = 0.55 } = {}) {
  const out = new Uint8ClampedArray(N * N * 4);
  // สูตร Horn/ESRI วัด azimuth ตามเข็มจากทิศเหนือ แต่ aspect จาก atan2 วัดทวนเข็มจากตะวันออก
  // ต้องแปลง 360 − az + 90 ก่อน ไม่งั้นทิศแสงเพี้ยน (เทสต์ลาดขึ้น SE จับได้: ได้เงาแทนรับแสง)
  const az = (((360 - azDeg + 90) % 360) * Math.PI) / 180, zen = (90 - altDeg) * Math.PI / 180;
  const cz = Math.cos(zen), sz = Math.sin(zen);
  const flat = cz;                                  // ค่าแสงของพื้นราบ = จุดโปร่งใส
  const at = (i, j) => elev[Math.min(N - 1, Math.max(0, j)) * N + Math.min(N - 1, Math.max(0, i))];
  for (let j = 0; j < N; j++) for (let i = 0; i < N; i++) {
    const a = at(i - 1, j - 1), b = at(i, j - 1), c = at(i + 1, j - 1);
    const d = at(i - 1, j),                         f = at(i + 1, j);
    const g = at(i - 1, j + 1), h = at(i, j + 1),   k = at(i + 1, j + 1);
    const dzdx = ((c + 2 * f + k) - (a + 2 * d + g)) / (8 * cell) * exag;   // ตะวันออกบวก
    const dzdy = ((g + 2 * h + k) - (a + 2 * b + c)) / (8 * cell) * exag;   // ใต้บวก (แถว j เพิ่ม)
    const slope = Math.atan(Math.hypot(dzdx, dzdy));
    let aspect = Math.atan2(dzdy, -dzdx);           // นิยาม ESRI (dzdy ใต้บวก)
    if (aspect < 0) aspect += 2 * Math.PI;
    const shade = cz * Math.cos(slope) + sz * Math.sin(slope) * Math.cos(az - aspect);
    const diff = shade - flat;                      // >0 รับแสง <0 เงา
    const p = (j * N + i) * 4;
    const v = diff > 0 ? 255 : 0;
    out[p] = v; out[p + 1] = v; out[p + 2] = v;
    out[p + 3] = Math.round(Math.min(1, Math.abs(diff) / flat) * maxAlpha * 255);
  }
  return out;
}

/** ระดับเส้นชั้นความสูงที่กลมสวย ~6–8 เส้น */
export function contourLevels(minZ, maxZ, target = 7) {
  const range = Math.max(1, maxZ - minZ);
  const steps = [10, 20, 25, 50, 100, 200, 250, 500, 1000, 2000];
  const step = steps.reduce((best, s) => Math.abs(range / s - target) < Math.abs(range / best - target) ? s : best, steps[0]);
  const out = [];
  for (let v = Math.ceil(minZ / step) * step; v < maxZ; v += step) out.push(v);
  return out;
}

/**
 * เส้นชั้นความสูงเป็น GeoJSON Feature[] (MultiPolygon) พิกัด [lng, lat]
 * grid = {N, R, cx, cy} · toLL(x, y) → {lat, lng} ฉีดมาจากแอปเพื่อใช้สูตรเดียวกับควันเป๊ะ
 */
export function terrainContourGeoJSON(elev, grid, levels, toLL) {
  const { N, R, cx, cy } = grid, cell = 2 * R / N;
  const g = new Float64Array(N * N); for (let q = 0; q < N * N; q++) g[q] = elev[q];
  return d3.contours().size([N, N]).thresholds(levels)(g).map(c => ({
    type: 'Feature',
    properties: { elevation: c.value },
    geometry: {
      type: 'MultiPolygon',
      coordinates: c.coordinates.map(poly => poly.map(ring => ring.map(pt => {
        const ll = toLL(cx - R + pt[0] * cell, cy + R - pt[1] * cell);
        return [ll.lng, ll.lat];
      }))),
    },
  })).filter(f => f.geometry.coordinates.length);
}

/* ── ส่วน Leaflet ───────────────────────────────────────────────────────── */
const PANE = 'terrainPane';
let hillL = null, contL = null, renderer = null;

function ensurePane(map, L) {
  if (!map.getPane(PANE)) {
    const p = map.createPane(PANE);
    p.style.zIndex = 350;                          // ใต้ overlayPane (400) เสมอ
    p.style.pointerEvents = 'none';
  }
  if (!renderer) renderer = L.canvas({ pane: PANE });
}

/**
 * วาด/อัปเดตภูมิประเทศใต้ควัน
 * opts = { L, elev, grid:{N,R,cx,cy}, origin, toLL(x,y,origin)→L.LatLng, minZ, maxZ }
 */
export function showTerrain(map, { L, elev, grid, origin, toLL, minZ, maxZ }) {
  ensurePane(map, L);
  clearTerrain(map);
  const { N, R, cx, cy } = grid, cell = 2 * R / N;

  const cv = document.createElement('canvas'); cv.width = N; cv.height = N;
  const ctx = cv.getContext('2d');
  const img = ctx.createImageData(N, N);
  img.data.set(hillshadeRGBA(elev, N, cell));
  ctx.putImageData(img, 0, 0);
  const bounds = L.latLngBounds(toLL(cx - R, cy - R, origin), toLL(cx + R, cy + R, origin));   // เหมือน rasterL
  hillL = L.imageOverlay(cv.toDataURL(), bounds, { opacity: 1, interactive: false, pane: PANE }).addTo(map);

  const feats = terrainContourGeoJSON(elev, grid, contourLevels(minZ, maxZ), (x, y) => toLL(x, y, origin));
  contL = L.geoJSON({ type: 'FeatureCollection', features: feats }, {
    pane: PANE, renderer,
    style: { color: '#c9b98a', weight: 0.9, opacity: 0.45, fill: false, dashArray: '2 3' },
  }).addTo(map);
  return { levels: feats.map(f => f.properties.elevation) };
}

export function clearTerrain(map) {
  if (hillL) { map.removeLayer(hillL); hillL = null; }
  if (contL) { map.removeLayer(contL); contL = null; }
}
