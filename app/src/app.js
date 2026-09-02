import './styles.css';
import 'leaflet/dist/leaflet.css';
import L from 'leaflet';
import * as d3 from 'd3';
import { run as engineRunSync } from 'mokhwan-engine';
import EngineWorker from 'mokhwan-engine/worker?worker';

'use strict';
const $ = id => document.getElementById(id);
const RAI = 1600;

/* ---------------- reference data ---------------- */
const FUELS = {
  rice:    {n:'ฟางข้าว / ตอซังข้าว',    load:0.60, ef:9.5,  cc:0.89},
  maize:   {n:'ต้นและซังข้าวโพด',        load:0.65, ef:8.0,  cc:0.85},
  cane:    {n:'ใบอ้อย',                  load:1.20, ef:4.5,  cc:0.90},
  cassava: {n:'เศษมันสำปะหลัง',          load:0.55, ef:8.5,  cc:0.82},
  forestD: {n:'ป่าเต็งรัง (ใบไม้แห้ง)',   load:0.50, ef:12.0, cc:0.85},
  forestM: {n:'ป่าเบญจพรรณ',             load:0.80, ef:11.0, cc:0.80},
  brush:   {n:'วัชพืช / ปรับพื้นที่',      load:0.70, ef:9.0,  cc:0.85},
  waste:   {n:'ขยะและเศษวัสดุปนเปื้อน',   load:1.00, ef:10.0, cc:0.75},
};
const STAB = {A:'A · ไม่เสถียรมาก', B:'B · ไม่เสถียรปานกลาง', C:'C · ไม่เสถียรเล็กน้อย',
              D:'D · เป็นกลาง', E:'E · เสถียรเล็กน้อย', F:'F · เสถียรมาก'};
const BANDS = [
  {lo:15,   hi:25,   c:'#4aa3d8', n:'ดี'},
  {lo:25,   hi:37.5, c:'#5cb85c', n:'ปานกลาง'},
  {lo:37.5, hi:75,   c:'#e8c33a', n:'เริ่มมีผลต่อสุขภาพ'},
  {lo:75,   hi:150,  c:'#ef8a3c', n:'มีผลต่อสุขภาพ'},
  {lo:150,  hi:350,  c:'#e04b4b', n:'อันตราย'},
  {lo:350,  hi:null, c:'#8f4bc9', n:'อันตรายมาก'},
];
const BLO = BANDS.map(b => b.lo);
const REC_ICON = {school:'🏫', kindergarten:'🧸', hospital:'🏥', clinic:'⚕️', nursing_home:'🧓',
                  village:'🏘️', hamlet:'🏘️', town:'🏙️', city:'🏙️', suburb:'🏘️', manual:'📍'};
const REC_TH = {school:'โรงเรียน', kindergarten:'ศูนย์เด็กเล็ก', hospital:'โรงพยาบาล', clinic:'คลินิก/รพ.สต.',
                nursing_home:'สถานดูแลผู้สูงอายุ', village:'หมู่บ้าน', hamlet:'ชุมชนเล็ก', town:'เมือง',
                city:'เมืองใหญ่', suburb:'ย่านชุมชน', manual:'จุดที่ปักเอง'};

/* ---------------- state ---------------- */
const S = {
  mode:'point', draft:[], plots:[], sel:null, nextId:1, recPlacing:false,
  receptors:[],
  wxMode:'auto', wx:null, wxErr:null,
  man:{ws:2.0, wdir:45, stab:'E', mix:300},
  date:'', time:'08:00', dur:3,
  bg:25, bgAuto:false, bgSeries:null, avg:60, rangeKm:10, res:180, pop:180, opacity:0.6, depo:true,
  view:'hour', hourIndex:0, tab:'sum',
  result:null, origin:null, computing:false,
};
(function initDate(){
  const d = new Date();
  S.date = d.toISOString().slice(0,10);
  const h = d.getHours();
  S.time = String(Math.min(h, 20)).padStart(2,'0') + ':00';
})();

/* ---------------- geometry helpers ---------------- */
const M_LAT = 111320;
const mLon = lat => 111320*Math.cos(lat*Math.PI/180);
const toXY = (ll,o) => [ (ll.lng-o.lng)*mLon(o.lat), (ll.lat-o.lat)*M_LAT ];
const toLL = (x,y,o) => L.latLng(o.lat + y/M_LAT, o.lng + x/mLon(o.lat));
const fmt = (v,d=1) => (isFinite(v)?Number(v):0).toLocaleString('th-TH',{minimumFractionDigits:d, maximumFractionDigits:d});
const DIRS = ['เหนือ','ตอ.เฉียงเหนือ','ตะวันออก','ตอ.เฉียงใต้','ใต้','ตต.เฉียงใต้','ตะวันตก','ตต.เฉียงเหนือ'];
const compass = d => DIRS[Math.round((((d%360)+360)%360)/45)%8];

function polyArea(pts, o){
  let a = 0;
  for(let i=0;i<pts.length;i++){
    const p = toXY(pts[i],o), q = toXY(pts[(i+1)%pts.length],o);
    a += p[0]*q[1] - q[0]*p[1];
  }
  return Math.abs(a/2);
}
function inPoly(x,y,ring){
  let inside = false;
  for(let i=0,j=ring.length-1;i<ring.length;j=i++){
    const xi=ring[i][0], yi=ring[i][1], xj=ring[j][0], yj=ring[j][1];
    if((yi>y)!==(yj>y) && x < (xj-xi)*(y-yi)/(yj-yi)+xi) inside = !inside;
  }
  return inside;
}
function plotCentroid(p){
  if(p.type === 'point') return p.latlng;
  let la=0, ln=0;
  p.latlngs.forEach(c => { la += c.lat; ln += c.lng; });
  return L.latLng(la/p.latlngs.length, ln/p.latlngs.length);
}
function plotArea(p){
  return p.type === 'point' ? p.rai*RAI : polyArea(p.latlngs, plotCentroid(p));
}

/* ---------------- map ---------------- */
const map = L.map('map',{zoomControl:true, preferCanvas:true}).setView([18.7883,98.9853], 13);
L.control.scale({imperial:false, position:'bottomright'}).addTo(map);

const BASEMAPS = [
  {n:'พื้นเทาเข้ม', url:'https://server.arcgisonline.com/ArcGIS/rest/services/Canvas/World_Dark_Gray_Base/MapServer/tile/{z}/{y}/{x}',
   max:16, over:18, attr:'&copy; Esri',
   ref:'https://server.arcgisonline.com/ArcGIS/rest/services/Canvas/World_Dark_Gray_Reference/MapServer/tile/{z}/{y}/{x}'},
  {n:'แผนที่ถนน OSM', url:'https://tile.openstreetmap.org/{z}/{x}/{y}.png', max:19, attr:'&copy; OpenStreetMap', dim:true},
  {n:'ภาพดาวเทียม', url:'https://server.arcgisonline.com/ArcGIS/rest/services/World_Imagery/MapServer/tile/{z}/{y}/{x}',
   max:19, attr:'&copy; Esri, Maxar',
   ref:'https://server.arcgisonline.com/ArcGIS/rest/services/Reference/World_Boundaries_and_Places/MapServer/tile/{z}/{y}/{x}'},
  {n:'พื้นเทาอ่อน', url:'https://server.arcgisonline.com/ArcGIS/rest/services/Canvas/World_Light_Gray_Base/MapServer/tile/{z}/{y}/{x}',
   max:16, over:18, attr:'&copy; Esri',
   ref:'https://server.arcgisonline.com/ArcGIS/rest/services/Canvas/World_Light_Gray_Reference/MapServer/tile/{z}/{y}/{x}'},
  {n:'ภูมิประเทศ', url:'https://{s}.tile.opentopomap.org/{z}/{x}/{y}.png', sub:'abc', max:17,
   attr:'&copy; OpenTopoMap (CC-BY-SA)', dim:true},
];
let baseIdx = 0, baseL = null, labelL = null, probe = null, tried = 0;

function setBase(i, manual){
  baseIdx = i;
  const b = BASEMAPS[i];
  if(baseL) map.removeLayer(baseL);
  if(labelL){ map.removeLayer(labelL); labelL = null; }
  let ok = 0, bad = 0;
  baseL = L.tileLayer(b.url, {maxZoom: b.over || b.max, maxNativeZoom: b.max,
    subdomains: b.sub || 'abc', attribution: b.attr, className: b.dim ? 'dimtiles' : ''});
  baseL.on('tileload', () => { if(++ok === 1){ $('tilewarn').style.display='none'; clearTimeout(probe); } });
  baseL.on('tileerror', () => { if(++bad >= 4 && ok === 0 && !manual) nextBase(); });
  baseL.addTo(map);
  if(b.ref) labelL = L.tileLayer(b.ref, {maxZoom: b.over || b.max, maxNativeZoom: b.max, opacity:.95}).addTo(map);
  $('basesel').value = i;
  clearTimeout(probe);
  probe = setTimeout(() => { if(ok === 0){ manual ? showTileWarn() : nextBase(); } }, 5000);
}
function nextBase(){
  if(tried >= BASEMAPS.length-1){ showTileWarn(); return; }
  tried++; setBase((baseIdx+1) % BASEMAPS.length);
}
function showTileWarn(){
  $('tilewarn').innerHTML = 'ตัวพรีวิวบล็อกภาพแผนที่ — ดาวน์โหลดไฟล์ไปเปิดในเบราว์เซอร์ปกติจะขึ้นครบ การคำนวณยังทำงานอยู่';
  $('tilewarn').style.display = 'block';
}

const gPlots = L.layerGroup().addTo(map);
const gDraft = L.layerGroup().addTo(map);
const gRec   = L.layerGroup().addTo(map);
const gCont  = L.layerGroup().addTo(map);
let rasterL = null, axisL = null;

/* ---------------- compute bridge (worker หรือ inline) ---------------- */
let worker = null;
try{ worker = new EngineWorker(); }catch(err){ worker = null; }

let reqSeq = 0, pendingResolve = null;
if(worker){
  worker.onmessage = ev => { if(pendingResolve){ const r = pendingResolve; pendingResolve = null; r(ev.data); } };
  worker.onerror = () => { worker = null; };
}
function engineRun(payload){
  if(worker){
    return new Promise(res => { pendingResolve = res; worker.postMessage(payload); });
  }
  return Promise.resolve(engineRunSync(payload));
}

/* ---------------- weather ---------------- */
function pasquill(ws, srad, isDay, cloudPct){
  if(isDay && srad > 20){
    const ins = srad >= 700 ? 3 : srad >= 350 ? 2 : 1;
    if(ws < 2)  return ins === 3 ? 'A' : ins === 2 ? 'A' : 'B';
    if(ws < 3)  return ins === 3 ? 'A' : ins === 2 ? 'B' : 'C';
    if(ws < 5)  return ins === 3 ? 'B' : ins === 2 ? 'C' : 'C';
    if(ws < 6)  return ins === 3 ? 'C' : 'D';
    return ins === 3 ? 'C' : 'D';
  }
  const cloudy = cloudPct >= 50;
  if(ws < 2) return cloudy ? 'E' : 'F';
  if(ws < 3) return cloudy ? 'E' : 'F';
  if(ws < 5) return cloudy ? 'D' : 'E';
  return 'D';
}

async function fetchWeather(){
  const c = fireCentroid();
  if(!c){ setWxStatus('วางแปลงเผาบนแผนที่ก่อน จึงจะดึงพยากรณ์ของจุดนั้นได้', true); return; }
  setWxStatus('<span class="spin"></span> กำลังดึงพยากรณ์…');
  const params = new URLSearchParams({
    latitude: c.lat.toFixed(4), longitude: c.lng.toFixed(4),
    hourly: 'temperature_2m,relative_humidity_2m,precipitation,cloud_cover,wind_speed_10m,wind_direction_10m,boundary_layer_height,shortwave_radiation,is_day',
    wind_speed_unit: 'ms', timezone: 'Asia/Bangkok', past_days: '2', forecast_days: '7'
  });
  try{
    const r = await fetch('https://api.open-meteo.com/v1/forecast?' + params);
    if(!r.ok) throw new Error('HTTP ' + r.status);
    const j = await r.json();
    const H = j.hourly;
    const byTime = {};
    H.time.forEach((t,i) => {
      const ws = Math.max(H.wind_speed_10m[i] ?? 1, 0.3);
      const srad = H.shortwave_radiation[i] ?? 0;
      const cc = H.cloud_cover[i] ?? 0;
      const day = (H.is_day[i] ?? (srad > 20 ? 1 : 0)) === 1;
      let blh = H.boundary_layer_height ? H.boundary_layer_height[i] : null;
      if(!blh || blh < 40) blh = day ? 800 : 200;
      byTime[t] = {
        ws, wdir: H.wind_direction_10m[i] ?? 0,
        stab: pasquill(ws, srad, day, cc),
        mix: Math.round(blh),
        precip: H.precipitation[i] ?? 0,
        temp: H.temperature_2m[i] ?? null,
        rh: H.relative_humidity_2m[i] ?? null,
        cloud: cc, srad
      };
    });
    S.wx = byTime; S.wxErr = null;
    $('wxsrc').textContent = 'Open-Meteo · ' + c.lat.toFixed(3) + ', ' + c.lng.toFixed(3);

    // ค่าพื้นหลัง PM2.5 รายชั่วโมงจาก Open-Meteo Air Quality
    let aqNote = '';
    try{
      const ap = new URLSearchParams({
        latitude: c.lat.toFixed(4), longitude: c.lng.toFixed(4),
        hourly: 'pm2_5', timezone: 'Asia/Bangkok', past_days: '2', forecast_days: '5'
      });
      const ar = await fetch('https://air-quality-api.open-meteo.com/v1/air-quality?' + ap);
      if(ar.ok){
        const aj = await ar.json();
        const ser = {};
        aj.hourly.time.forEach((t,i) => { const v = aj.hourly.pm2_5[i]; if(v != null) ser[t.slice(0,16)] = v; });
        if(Object.keys(ser).length){
          S.bgSeries = ser;
          if(!S.bgAuto){ S.bgAuto = true; $('bgAuto').checked = true; }
          aqNote = ' · ได้ค่าพื้นหลัง PM2.5 รายชั่วโมงมาด้วย';
        }
      }
    }catch(e){ /* ค่าพื้นหลังเป็นของเสริม ไม่มีก็ใช้ค่าที่กรอกเอง */ }

    setWxStatus('ได้ข้อมูลแล้ว ย้อนหลัง 2 วันถึงอีก 7 วันข้างหน้า' + aqNote);
    schedule();
  }catch(e){
    S.wx = null; S.wxErr = String(e.message || e);
    setWxStatus('ดึงพยากรณ์ไม่ได้ (' + S.wxErr + ') — สลับไปโหมดกำหนดเองแล้ว ถ้าเปิดไฟล์ในเบราว์เซอร์ปกติมักใช้ได้', true);
    setWxMode('man');
  }
}
function setWxStatus(html, isErr){
  $('wxStatus').innerHTML = html ? '<div class="' + (isErr?'errbox':'hint') + '">' + html + '</div>' : '';
}

/* สร้างชุดชั่วโมงสำหรับการจำลอง */
function buildHours(){
  const n = Math.max(1, Math.round(S.dur));
  const start = new Date(S.date + 'T' + S.time + ':00');
  const out = [];
  for(let i=0;i<n;i++){
    const t = new Date(start.getTime() + i*3600000);
    const key = t.getFullYear() + '-' + String(t.getMonth()+1).padStart(2,'0') + '-' +
                String(t.getDate()).padStart(2,'0') + 'T' + String(t.getHours()).padStart(2,'0') + ':00';
    let w;
    if(S.wxMode === 'auto' && S.wx && S.wx[key]) w = Object.assign({}, S.wx[key]);
    else w = {ws:S.man.ws, wdir:S.man.wdir, stab:S.man.stab, mix:S.man.mix, precip:0, temp:null, rh:null};
    w.t = key; w.dt = 3600;
    out.push(w);
  }
  return out;
}
function hourWeights(n){
  const w = [], p = [];
  let s = 0;
  for(let i=0;i<n;i++){ const x = (i+0.5)/n; const v = Math.exp(-1.6*x); w.push(v); p.push(x); s += v; }
  return {w: w.map(v => v/s), p};
}

/* ---------------- fires → payload ---------------- */
function fireCentroid(){
  const on = S.plots.filter(p => p.on !== false);
  if(!on.length) return null;
  let la = 0, ln = 0;
  on.forEach(p => { const c = plotCentroid(p); la += c.lat; ln += c.lng; });
  return L.latLng(la/on.length, ln/on.length);
}
function buildFires(origin){
  const out = [];
  S.plots.filter(p => p.on !== false).forEach(p => {
    let areaM2, pts = [];
    const c = plotCentroid(p);
    const off = toXY(c, origin);
    if(p.type === 'point'){
      areaM2 = p.rai*RAI;
      const side = Math.sqrt(areaM2), n = 5, step = side/n;
      for(let i=0;i<n;i++) for(let j=0;j<n;j++)
        pts.push([off[0] + (i-2)*step, off[1] + (j-2)*step]);
    }else{
      const ring = p.latlngs.map(ll => toXY(ll, origin));
      areaM2 = polyArea(p.latlngs, origin);
      const xs = ring.map(r => r[0]), ys = ring.map(r => r[1]);
      const x0 = Math.min(...xs), x1 = Math.max(...xs), y0 = Math.min(...ys), y1 = Math.max(...ys);
      let step = Math.max(Math.sqrt(areaM2/45), 4);
      for(let k=0;k<7;k++){
        pts = [];
        for(let x=x0+step/2; x<x1; x+=step) for(let y=y0+step/2; y<y1; y+=step)
          if(inPoly(x,y,ring)) pts.push([x,y]);
        if(pts.length && pts.length <= 60) break;
        if(!pts.length){ pts = [[(x0+x1)/2,(y0+y1)/2]]; break; }
        step *= 1.35;
      }
    }
    const rai = areaM2/RAI;
    const fuelKg = rai*p.load*1000*p.cc;
    out.push({pts, side:Math.sqrt(areaM2), fuelKg, totalG: fuelKg*p.ef,
              smold: 0.18 + 0.62*p.moist, rai});
  });
  return out;
}

/* ---------------- run ---------------- */
let schedTimer = null;
function schedule(){ clearTimeout(schedTimer); schedTimer = setTimeout(runSim, 90); }

async function runSim(){
  const origin = fireCentroid();
  if(!origin){ S.result = null; clearOverlay(); renderPanel(); renderTimeline(); return; }
  S.origin = origin;
  const fires = buildFires(origin);
  if(!fires.length){ S.result = null; clearOverlay(); renderPanel(); return; }

  const hours = buildHours();
  if(S.hourIndex >= hours.length) S.hourIndex = hours.length - 1;
  const hw = hourWeights(hours.length);

  let ux = 0, uy = 0;
  hours.forEach(h => { const th = (270-h.wdir)*Math.PI/180; ux += Math.cos(th); uy += Math.sin(th); });
  const un = Math.hypot(ux,uy) || 1; ux /= un; uy /= un;

  const R = S.rangeKm*1000;
  const payload = {
    fires, hours, weights: hw.w, progress: hw.p,
    grid: {N: S.res, R, cx: 0.32*R*ux, cy: 0.32*R*uy},
    receptors: S.receptors.map(r => toXY(r.ll, origin)),
    bg: S.bg, avg: S.avg, depo: S.depo, reqId: ++reqSeq,
  };

  S.computing = true; renderPanel();
  const res = await engineRun(payload);
  if(res.reqId !== reqSeq) return;
  S.computing = false;
  S.result = res;
  if(S.hourIndex >= res.perHour.length) S.hourIndex = res.perHour.length - 1;
  renderTimeline();
  refresh();
}

/* ค่าพื้นหลัง PM2.5 ที่ใช้กับมุมมองปัจจุบัน */
function curBg(){
  if(!S.bgAuto || !S.bgSeries || !S.result) return S.bg;
  const vals = S.result.perHour.map(h => S.bgSeries[h.t]).filter(v => v != null);
  if(!vals.length) return S.bg;
  if(S.view === 'max')  return Math.max(...vals);
  if(S.view === 'dose') return vals.reduce((a,b) => a+b, 0)/vals.length;
  const v = S.bgSeries[S.result.perHour[S.hourIndex].t];
  return v != null ? v : S.bg;
}

/* กริดที่กำลังแสดงตามมุมมองปัจจุบัน */
function currentGrid(){
  const r = S.result;
  if(!r) return null;
  if(S.view === 'max')  return r.maxGrid;
  if(S.view === 'dose') return r.doseGrid;
  return r.grids[S.hourIndex] || r.grids[0];
}
function recValue(i){
  const r = S.result;
  if(!r) return 0;
  if(S.view === 'max')  return r.recMax[i];
  if(S.view === 'dose') return r.recDose[i]/24;
  return (r.recPerHour[S.hourIndex] || r.recPerHour[0])[i];
}
/* สถิติของกริดที่แสดง — เบาพอจะคำนวณสดทุกเฟรม */
function computeStats(disp){
  const r = S.result, N = r.N, cell = r.cell, cx = r.cx, cy = r.cy, R = r.R;
  const BG = curBg();
  const cellKm2 = cell*cell/1e6;
  const areas = new Array(BANDS.length).fill(0);
  let dmax = 0, dmaxD = 0, reach = 0;
  for(let j=0;j<N;j++){
    const py = cy + R - (j+0.5)*cell;
    for(let i=0;i<N;i++){
      const v = disp[j*N+i];
      if(v > dmax){ dmax = v; dmaxD = Math.hypot(cx - R + (i+0.5)*cell, py); }
      if(v < 0.5) continue;
      const b = bandOf(v + BG);
      if(b >= 0) areas[b] += cellKm2;
      if(v + BG >= 37.5){
        const d = (cx - R + (i+0.5)*cell)*r.meanUx + py*r.meanUy;
        if(d > reach) reach = d;
      }
    }
  }
  return {areas, dmax, dmaxD, reach};
}
/* วาดใหม่โดยไม่คำนวณฟิสิกส์ซ้ำ */
function refresh(){
  if(!S.result){ clearOverlay(); renderPanel(); return; }
  const disp = currentGrid();
  S.stats = computeStats(disp);
  drawOverlay(disp);
  highlightHour();
  redrawRecs();
  renderPanel();
  syncWeather();
  if(is3D) update3D();
}

/* ---------------- overlay rendering ---------------- */
function clearOverlay(){
  if(rasterL){ map.removeLayer(rasterL); rasterL = null; }
  if(axisL){ map.removeLayer(axisL); axisL = null; }
  gCont.clearLayers();
}
function bandOf(v){
  for(let b=BANDS.length-1;b>=0;b--) if(v >= BANDS[b].lo) return b;
  return -1;
}
function drawOverlay(disp){
  clearOverlay();
  const res = S.result;
  const {N, cx, cy, R} = res, o = S.origin;
  const cv = document.createElement('canvas');
  cv.width = N; cv.height = N;
  const ctx = cv.getContext('2d');
  const img = ctx.createImageData(N,N), d = img.data;
  const BG = curBg();
  for(let k=0;k<N*N;k++){
    const tot = disp[k] + BG;
    const b = bandOf(tot);
    if(b < 0 || disp[k] < 0.5){ d[k*4+3] = 0; continue; }
    const col = BANDS[b].c;
    d[k*4]   = parseInt(col.slice(1,3),16);
    d[k*4+1] = parseInt(col.slice(3,5),16);
    d[k*4+2] = parseInt(col.slice(5,7),16);
    d[k*4+3] = Math.min(240, (0.30 + 0.115*b)*255*(S.opacity/0.6));
  }
  ctx.putImageData(img,0,0);
  const bounds = L.latLngBounds(toLL(cx-R, cy-R, o), toLL(cx+R, cy+R, o));
  const url = cv.toDataURL();
  S.lastRaster = {url, bounds:{west:bounds.getWest(), east:bounds.getEast(),
                               north:bounds.getNorth(), south:bounds.getSouth()}};
  rasterL = L.imageOverlay(url, bounds, {opacity:1, interactive:false, zIndex:250}).addTo(map);

  // เส้นชั้นความเข้มข้น
  if(d3.contours){   // d3 เป็น static import แล้ว ไม่ต้องเช็คว่ามีตัวมันอยู่
    const grid = new Float64Array(N*N);
    for(let k=0;k<N*N;k++) grid[k] = disp[k] < 0.5 ? 0 : disp[k] + BG;
    const cell = res.cell;
    const thr = BLO.filter(t => t > BG + 0.5);
    S.contours = [];
    if(thr.length){
      const cs = d3.contours().size([N,N]).thresholds(thr)(grid);
      cs.forEach(c => {
      const b = BLO.indexOf(c.value);
      const rings = c.coordinates.map(poly => poly.map(ring =>
        ring.map(pt => {
          const x = cx - R + pt[0]*cell;
          const y = cy + R - pt[1]*cell;
          const ll = toLL(x,y,o);
          return [ll.lng, ll.lat];
        })));
      if(!rings.length) return;
      const gj = {type:'Feature', properties:{threshold:c.value, label:BANDS[b] ? BANDS[b].n : ''},
                  geometry:{type:'MultiPolygon', coordinates:rings}};
      S.contours.push(gj);
      L.geoJSON(gj, {style:{color: BANDS[b] ? BANDS[b].c : '#fff', weight:1.2, opacity:.85, fill:false}}).addTo(gCont);
      });
    }
  }

  // แกนกลางพลูมเฉลี่ย
  const a = toLL(0,0,o), b2 = toLL(res.meanUx*R*1.4, res.meanUy*R*1.4, o);
  axisL = L.polyline([a,b2], {color:'#e8b13c', weight:1, dashArray:'6 6', opacity:.55}).addTo(map);
}

/* ---------------- plots on map ---------------- */
function redrawPlots(){
  gPlots.clearLayers(); gDraft.clearLayers();
  S.draft.forEach(p => L.circleMarker(p,{radius:4,color:'#e8b13c',fillOpacity:1,weight:2}).addTo(gDraft));
  if(S.draft.length > 1) L.polyline(S.draft,{color:'#e8b13c',weight:2,dashArray:'4 4'}).addTo(gDraft);

  S.plots.forEach(p => {
    const selStyle = p.id === S.sel;
    const st = {color:'#e0553f', weight: selStyle?2.5:1.5, fillColor:'#e0553f',
                fillOpacity: p.on===false ? .08 : .26, dashArray: p.on===false ? '4 4' : null};
    if(p.type === 'point'){
      L.circle(p.latlng, Object.assign({radius: Math.sqrt(p.rai*RAI/Math.PI)}, st))
        .on('click', e => { L.DomEvent.stop(e); selectPlot(p.id); }).addTo(gPlots);
      L.marker(p.latlng, {icon:L.divIcon({className:'', html:'<div class="firemark">🔥</div>', iconSize:[18,18], iconAnchor:[9,9]})}).addTo(gPlots);
    }else{
      L.polygon(p.latlngs, st).on('click', e => { L.DomEvent.stop(e); selectPlot(p.id); }).addTo(gPlots);
    }
  });
  renderPlotList();
}
function renderPlotList(){
  const el = $('plots');
  if(!S.plots.length){ el.innerHTML = '<div class="empty">ยังไม่มีแปลง — เลือกโหมดด้านล่างแล้วคลิกบนแผนที่</div>'; $('totarea').textContent=''; return; }
  el.innerHTML = '';
  let tot = 0;
  S.plots.forEach((p,i) => {
    const rai = plotArea(p)/RAI; tot += (p.on===false?0:rai);
    const d = document.createElement('div');
    d.className = 'plot' + (p.id===S.sel?' sel':'') + (p.on===false?' off':'');
    d.innerHTML = '<i class="sw"></i><span class="nm">' + (i+1) + '. ' + FUELS[p.fuel].n +
      '</span><span class="ar">' + fmt(rai,1) + ' ไร่</span>';
    const tg = document.createElement('button');
    tg.className='x'; tg.textContent = p.on===false ? '○' : '●'; tg.title='เปิด/ปิดแปลงนี้';
    tg.onclick = e => { e.stopPropagation(); p.on = p.on===false; redrawPlots(); schedule(); };
    const x = document.createElement('button');
    x.className='x'; x.textContent='×'; x.title='ลบแปลง';
    x.onclick = e => { e.stopPropagation(); S.plots = S.plots.filter(q => q.id !== p.id);
                       if(S.sel === p.id) S.sel = S.plots.length ? S.plots[0].id : null;
                       redrawPlots(); syncEditor(); schedule(); };
    d.append(tg, x);
    d.onclick = () => selectPlot(p.id);
    el.appendChild(d);
  });
  $('totarea').textContent = fmt(tot,1) + ' ไร่ · ' + fmt(tot*RAI/1e6,3) + ' กม²';
}
function selectPlot(id){ S.sel = id; redrawPlots(); syncEditor(); }
function currentPlot(){ return S.plots.find(p => p.id === S.sel); }
function syncEditor(){
  const p = currentPlot();
  $('plotEditor').style.display = p ? '' : 'none';
  if(!p) return;
  $('fuel').value = p.fuel; $('load').value = p.load; $('ef').value = p.ef; $('cc').value = p.cc;
  $('moist').value = p.moist;
  $('moisttxt').textContent = p.moist < 0.25 ? 'แห้งมาก' : p.moist < 0.5 ? 'ปานกลาง' : p.moist < 0.7 ? 'ค่อนข้างชื้น' : 'ชื้นมาก';
  const isPt = p.type === 'point';
  $('rai').parentElement.style.display = isPt ? '' : 'none';
  if(isPt) $('rai').value = p.rai;
}
function addPlot(obj){
  const p = Object.assign({id:S.nextId++, fuel:'rice', load:FUELS.rice.load, ef:FUELS.rice.ef,
                           cc:FUELS.rice.cc, moist:0.35, on:true}, obj);
  S.plots.push(p); S.sel = p.id;
  redrawPlots(); syncEditor(); schedule();
}

/* ---------------- receptors ---------------- */
function recColor(v){ const b = bandOf(v); return b < 0 ? '#4a5b70' : BANDS[b].c; }
function redrawRecs(){
  gRec.clearLayers();
  const res = S.result;
  S.receptors.forEach((r,i) => {
    let v = null;
    if(res) v = recValue(i) + curBg();
    const col = v === null ? '#6b7c92' : recColor(v);
    const m = L.circleMarker(r.ll, {radius:5, color:'#0e141c', weight:1.5, fillColor:col, fillOpacity:1})
      .bindTooltip((REC_ICON[r.kind]||'📍') + ' ' + r.name + (v!==null ? ' — ' + fmt(v,0) + ' µg/m³' : ''),
                   {direction:'top'});
    m.addTo(gRec);
  });
  $('rectag').textContent = S.receptors.length ? S.receptors.length + ' จุด' : '';
}
async function fetchOsm(){
  const c = fireCentroid();
  if(!c){ $('osmStatus').innerHTML = '<div class="errbox">วางแปลงเผาก่อน</div>'; return; }
  const R = Math.round(Math.max(1, Math.min(30, +$('recrad').value))*1000);
  $('osmStatus').innerHTML = '<div class="hint"><span class="spin"></span> กำลังค้นหาในรัศมี ' + (R/1000) + ' กม.…</div>';
  const q = '[out:json][timeout:40];(' +
    'nwr["amenity"~"^(school|kindergarten|hospital|clinic|nursing_home)$"](around:' + R + ',' + c.lat + ',' + c.lng + ');' +
    'node["place"~"^(village|hamlet|town|city|suburb)$"](around:' + R + ',' + c.lat + ',' + c.lng + ');' +
    ');out center 400;';
  const eps = ['https://overpass-api.de/api/interpreter',
               'https://overpass.kumi.systems/api/interpreter',
               'https://overpass.private.coffee/api/interpreter',
               'https://maps.mail.ru/osm/tools/overpass/api/interpreter'];
  for(const ep of eps){
    try{
      const r = await fetch(ep, {method:'POST', body:'data=' + encodeURIComponent(q),
                                headers:{'Content-Type':'application/x-www-form-urlencoded'}});
      if(!r.ok) throw new Error('HTTP ' + r.status);
      const j = await r.json();
      const found = [];
      (j.elements||[]).forEach(e => {
        const lat = e.lat ?? (e.center && e.center.lat), lon = e.lon ?? (e.center && e.center.lon);
        if(lat == null || lon == null) return;
        const t = e.tags || {};
        const kind = t.amenity || t.place || 'manual';
        const name = t['name:th'] || t.name || (REC_TH[kind] || 'จุดไม่ระบุชื่อ');
        found.push({ll: L.latLng(lat,lon), name, kind, src:'osm'});
      });
      // ตัดจุดซ้ำที่อยู่ใกล้กันมาก
      const kept = [];
      found.forEach(f => {
        if(!kept.some(k => k.name === f.name && k.ll.distanceTo(f.ll) < 250)) kept.push(f);
      });
      S.receptors = S.receptors.filter(r => r.src !== 'osm').concat(kept);
      $('osmStatus').innerHTML = '<div class="hint">พบ ' + kept.length + ' จุด · ข้อมูลจาก OpenStreetMap contributors</div>';
      redrawRecs(); schedule();
      return;
    }catch(e){ /* ลอง endpoint ถัดไป */ }
  }
  $('osmStatus').innerHTML = '<div class="errbox">' + netFail('Overpass ทั้ง ' + eps.length + ' เซิร์ฟเวอร์') +
    (OFFLINE ? '' : ' — เซิร์ฟเวอร์อาจโหลดหนักอยู่ ลองใหม่อีกครั้ง หรือปักหมุดเอง') + '</div>';
}

/* ---------------- panel ---------------- */
function renderPanel(){
  const el = $('pbody');
  if(S.computing && !S.result){ el.innerHTML = '<div class="hint"><span class="spin"></span> กำลังคำนวณ…</div>'; return; }
  if(!S.result){ el.innerHTML = '<div class="hint">วางแปลงเผาบนแผนที่เพื่อเริ่มจำลอง</div>'; return; }
  if(S.tab === 'sum') renderSummary(el);
  else if(S.tab === 'rec') renderRecs(el);
  else renderMet(el);
}
function viewLabel(){
  return S.view === 'hour' ? 'ชั่วโมงที่เลือก' : S.view === 'max' ? 'ค่าพีครายชั่วโมงสูงสุด' : 'ค่าเฉลี่ย 24 ชม.';
}
function renderSummary(el){
  const r = S.result, st = S.stats || {areas:[], dmax:0, dmaxD:0, reach:0};
  const BG = curBg();
  const totMax = st.dmax + BG;
  const overIdx = BLO.indexOf(37.5);
  const areaOver = st.areas.slice(overIdx).reduce((a,b) => a+b, 0);
  const pop = areaOver*S.pop;
  const hrs = r.perHour;
  const anyCap = hrs.some(h => h.capped);
  const rain = hrs.filter(h => h.precip > 0.1).length;

  let bands = '';
  BANDS.forEach((b,i) => {
    if(!st.areas[i] || st.areas[i] < 0.005) return;
    bands += '<div class="brow"><i style="background:' + b.c + '"></i><span class="n">' + b.n +
      ' <span style="opacity:.55">' + b.lo + (b.hi ? '–' + b.hi : '+') + '</span></span><span class="v">' +
      fmt(st.areas[i],2) + ' กม²</span></div>';
  });

  el.innerHTML =
    '<div class="sub">' + viewLabel() + (S.view==='hour' && hrs[S.hourIndex] ? ' · ' + hrs[S.hourIndex].t.slice(11) + ' น.' : '') + '</div>' +
    '<div class="st2"><span>ค่าสูงสุดบนพื้น</span><b style="color:' + recColor(totMax) + '">' + fmt(totMax,0) + ' µg/m³</b></div>' +
    '<div class="st2"><span>ห่างจากกองไฟ</span><b>' + fmt(st.dmaxD/1000,2) + ' กม.</b></div>' +
    '<div class="st2"><span>เกิน 37.5 ไปไกลถึง</span><b>' + (st.reach > 0 ? fmt(st.reach/1000,2) + ' กม.' : 'ไม่เกิน') + '</b></div>' +
    '<div class="st2"><span>ทิศที่ควันไปเฉลี่ย</span><b>' + compass(Math.atan2(r.meanUx, r.meanUy)*180/Math.PI) + '</b></div>' +
    '<div class="sep"></div>' +
    '<div class="st2"><span>เชื้อเพลิงที่ไหม้</span><b>' + fmt(r.totalFuelT,2) + ' ตัน</b></div>' +
    '<div class="st2"><span>PM2.5 ที่ปล่อยรวม</span><b>' + fmt(r.totalEmitKg,1) + ' กก.</b></div>' +
    '<div class="sep"></div>' +
    '<div class="sub">พื้นที่ตามระดับคุณภาพอากาศ</div>' +
    (bands || '<div class="hint">ควันเจือจางต่ำกว่าเกณฑ์ในระยะที่จำลอง</div>') +
    '<div class="st2" style="margin-top:6px"><span>ประชากรในเขตเกิน 37.5</span><b>≈ ' +
      Math.round(pop).toLocaleString('th-TH') + ' คน</b></div>' +
    (anyCap ? '<div class="warnbox">บางชั่วโมงพลูมชนเพดานชั้นผสม ควันขึ้นต่อไม่ได้จึงถูกกดกลับลงมาที่พื้น</div>' : '') +
    (rain ? '<div class="hint">มีฝนใน ' + rain + ' ชั่วโมง คิดผลการชะล้างควันแล้ว</div>' : '') +
    '<div class="note">อ้างอิงมาตรฐาน PM2.5 ของไทย 37.5 µg/m³ (เฉลี่ย 24 ชม.) และค่าแนะนำ WHO 15 µg/m³ · รวมพื้นหลัง ' + fmt(BG,0) + ' µg/m³' +
      (S.bgAuto && S.bgSeries ? ' จาก Open-Meteo Air Quality' : '') + '</div>';
}
function renderRecs(el){
  if(!S.receptors.length){
    el.innerHTML = '<div class="hint">ยังไม่มีจุดอ่อนไหว — กดปุ่มดึงข้อมูลจาก OpenStreetMap ในแผงซ้าย หรือปักหมุดเอง</div>';
    return;
  }
  const r = S.result, BG = curBg();
  const rows = S.receptors.map((rc,i) => {
    const v = recValue(i) + BG;
    const [x,y] = toXY(rc.ll, S.origin);
    return {rc, v, dist: Math.hypot(x,y)/1000, i};
  }).sort((a,b) => b.v - a.v);
  const over = rows.filter(x => x.v >= 37.5).length;
  let html = '<div class="sub">' + viewLabel() + ' · เกินมาตรฐาน ' + over + ' จาก ' + rows.length + ' จุด</div>';
  rows.slice(0,60).forEach(x => {
    const col = recColor(x.v);
    html += '<div class="rec"><span class="ic">' + (REC_ICON[x.rc.kind]||'📍') + '</span>' +
      '<span class="n">' + x.rc.name + '<br><span class="d">' + (REC_TH[x.rc.kind]||'') + ' · ' + fmt(x.dist,2) + ' กม.</span></span>' +
      '<span class="v" style="background:' + col + '22;color:' + col + '">' + fmt(x.v,0) + '</span></div>';
  });
  if(rows.length > 60) html += '<div class="hint">แสดง 60 อันดับแรก ส่งออก CSV เพื่อดูทั้งหมด</div>';
  el.innerHTML = html;
}
function renderMet(el){
  const hrs = S.result.perHour;
  const hbg = i => (S.bgAuto && S.bgSeries && S.bgSeries[hrs[i].t] != null) ? S.bgSeries[hrs[i].t] : S.bg;
  let html = '<div class="sub">สภาพอากาศและผลรายชั่วโมง</div>';
  hrs.forEach((h,i) => {
    html += '<div class="rec" style="cursor:pointer" data-h="' + i + '">' +
      '<span class="ic" style="transform:rotate(' + (h.wdir+180) + 'deg);display:inline-block;color:var(--hot)">↑</span>' +
      '<span class="n">' + h.t.slice(11) + ' น. · ' + fmt(h.ws,1) + ' ม./วิ ' + compass(h.wdir) +
      '<br><span class="d">ชั้น ' + h.stab + ' · ผสมสูง ' + Math.round(h.mix) + ' ม. · ปล่อย ' +
        Math.round(h.share*100) + '%' + (h.precip > 0.05 ? ' · ฝน ' + fmt(h.precip,1) + ' มม.' : '') + '</span></span>' +
      '<span class="v" style="background:' + recColor(h.max+hbg(i)) + '22;color:' + recColor(h.max+hbg(i)) + '">' +
        fmt(h.max+hbg(i),0) + '</span></div>';
  });
  html += '<div class="note">ชั้นความเสถียรคำนวณจากรังสีดวงอาทิตย์ เมฆ และความเร็วลม ตามตาราง Pasquill–Gifford · ความสูงชั้นผสมมาจากแบบจำลองอากาศของ Open-Meteo</div>';
  el.innerHTML = html;
  el.querySelectorAll('[data-h]').forEach(n => n.onclick = () => gotoHour(+n.dataset.h));
}

/* ---------------- weather layers (public APIs) ---------------- */
const OFFLINE = location.protocol === 'file:';
const WL = {radar:null, sat:null, gibs:null, fire:null};
let rvData = null, windGrid = null, windAnim = null;

function wlSay(txt){
  const b = $('wlbadge');
  if(!txt){ b.style.display = 'none'; return; }
  b.innerHTML = txt; b.style.display = '';
}
function netFail(what, e){
  return 'เรียก ' + what + ' ไม่ได้' + (OFFLINE ? ' — เพราะเปิดไฟล์แบบ file:// เบราว์เซอร์บล็อกไว้' : ' (' + (e && e.message || e) + ')');
}

/* --- RainViewer: เรดาร์ฝนและภาพอินฟราเรด --- */
async function ensureRV(){
  if(rvData) return rvData;
  const r = await fetch('https://api.rainviewer.com/public/weather-maps.json');
  if(!r.ok) throw new Error('HTTP ' + r.status);
  rvData = await r.json();
  return rvData;
}
function rvFrame(kind, isoLocal){
  if(!rvData) return null;
  const target = new Date(isoLocal + ':00').getTime()/1000;
  const list = kind === 'radar'
    ? (rvData.radar && (rvData.radar.past||[]).concat(rvData.radar.nowcast||[])) || []
    : (rvData.satellite && rvData.satellite.infrared) || [];
  if(!list.length) return null;
  let best = list[0];
  list.forEach(f => { if(Math.abs(f.time-target) < Math.abs(best.time-target)) best = f; });
  return best;
}
function rvUrl(kind, frame){
  return rvData.host + frame.path + '/256/{z}/{x}/{y}/' + (kind === 'radar' ? '2/1_1.png' : '0/0_0.png');
}
async function toggleRV(kind, on){
  const key = kind === 'radar' ? 'radar' : 'sat';
  const box = kind === 'radar' ? $('lyRadar') : $('lySat');
  if(!on){ if(WL[key]){ map.removeLayer(WL[key]); WL[key] = null; } syncWeather(); return; }
  try{
    await ensureRV();
    const f = rvFrame(kind, currentHourKey());
    if(!f) throw new Error('ไม่มีเฟรมข้อมูล');
    WL[key] = L.tileLayer(rvUrl(kind, f), {opacity:+$('wlopa').value, maxZoom:19,
      attribution:'&copy; RainViewer', zIndex: kind==='radar' ? 320 : 300}).addTo(map);
    syncWeather();
  }catch(e){
    box.checked = false;
    $('netnote').innerHTML = '<div class="errbox">' + netFail('RainViewer', e) + '</div>';
  }
}

/* --- NASA GIBS: ภาพดาวเทียมรายวันและจุดความร้อน --- */
const GIBS = 'https://gibs.earthdata.nasa.gov/wmts/epsg3857/best/';
function gibsUrl(layer, date, level, ext){
  return GIBS + layer + '/default/' + date + '/GoogleMapsCompatible_Level' + level + '/{z}/{y}/{x}.' + ext;
}
function toggleGibs(kind, on){
  const key = kind === 'true' ? 'gibs' : 'fire';
  if(WL[key]){ map.removeLayer(WL[key]); WL[key] = null; }
  if(!on){ syncWeather(); return; }
  const date = S.date;
  const cfg = kind === 'true'
    ? {layer:'VIIRS_NOAA20_CorrectedReflectance_TrueColor', level:9, ext:'jpg', z:280, op:+$('wlopa').value}
    : {layer:'VIIRS_NOAA20_Thermal_Anomalies_375m_All',     level:7, ext:'png', z:340, op:1};
  let bad = 0;
  WL[key] = L.tileLayer(gibsUrl(cfg.layer, date, cfg.level, cfg.ext), {
    maxZoom:18, maxNativeZoom:cfg.level, opacity:cfg.op, zIndex:cfg.z,
    attribution:'&copy; NASA EOSDIS GIBS'});
  WL[key].on('tileerror', () => {
    if(++bad === 6) $('netnote').innerHTML = '<div class="warnbox">NASA GIBS ยังไม่มีภาพของวันที่ ' + date +
      ' (ภาพรายวันมักขึ้นช้าราวครึ่งวัน) ลองเลือกวันก่อนหน้า</div>';
  });
  WL[key].addTo(map);
  syncWeather();
}

/* --- สนามลม: กริดจาก Open-Meteo แล้ววาดเป็นอนุภาคไหล --- */
async function fetchWindGrid(){
  const c = fireCentroid();
  if(!c) throw new Error('ยังไม่มีแปลงเผา');
  const n = 6, R = S.rangeKm*1000;
  const lats = [], lngs = [], pts = [];
  for(let j=0;j<n;j++) lats.push(c.lat + (-R + 2*R*j/(n-1))/M_LAT);
  for(let i=0;i<n;i++) lngs.push(c.lng + (-R + 2*R*i/(n-1))/mLon(c.lat));
  lats.forEach(la => lngs.forEach(ln => pts.push([la,ln])));
  const params = new URLSearchParams({
    latitude: pts.map(p => p[0].toFixed(4)).join(','),
    longitude: pts.map(p => p[1].toFixed(4)).join(','),
    hourly: 'wind_speed_10m,wind_direction_10m',
    wind_speed_unit: 'ms', timezone: 'Asia/Bangkok', past_days: '2', forecast_days: '7'
  });
  const r = await fetch('https://api.open-meteo.com/v1/forecast?' + params);
  if(!r.ok) throw new Error('HTTP ' + r.status);
  let j = await r.json();
  if(!Array.isArray(j)) j = [j];
  const byTime = {};
  j[0].hourly.time.forEach((t,k) => {
    const key = t.slice(0,16);
    byTime[key] = j.map(loc => {
      const ws = loc.hourly.wind_speed_10m[k] ?? 0;
      const wd = (loc.hourly.wind_direction_10m[k] ?? 0)*Math.PI/180;
      return [-ws*Math.sin(wd), -ws*Math.cos(wd)];   // u ตะวันออก, v เหนือ
    });
  });
  windGrid = {lats, lngs, n, byTime};
}
function sampleWind(lat, lng){
  const key = currentHourKey();
  const cell = windGrid && windGrid.byTime[key];
  if(!cell){                                          // ไม่มีกริด ใช้ลมของชั่วโมงนั้นแบบสม่ำเสมอ
    const h = S.result && S.result.perHour[S.hourIndex];
    if(!h) return [0,0];
    const wd = h.wdir*Math.PI/180;
    return [-h.ws*Math.sin(wd), -h.ws*Math.cos(wd)];
  }
  const {lats, lngs, n} = windGrid;
  const fy = (lat-lats[0])/(lats[n-1]-lats[0])*(n-1);
  const fx = (lng-lngs[0])/(lngs[n-1]-lngs[0])*(n-1);
  const cy = Math.max(0, Math.min(n-1.001, fy)), cx = Math.max(0, Math.min(n-1.001, fx));
  const j0 = Math.floor(cy), i0 = Math.floor(cx), ty = cy-j0, tx = cx-i0;
  const at = (j,i) => cell[j*n + i] || [0,0];
  const a = at(j0,i0), b = at(j0,i0+1), c2 = at(j0+1,i0), d = at(j0+1,i0+1);
  return [
    (a[0]*(1-tx)+b[0]*tx)*(1-ty) + (c2[0]*(1-tx)+d[0]*tx)*ty,
    (a[1]*(1-tx)+b[1]*tx)*(1-ty) + (c2[1]*(1-tx)+d[1]*tx)*ty,
  ];
}
function startWind(){
  if(windAnim) return;
  if(!map.getPane('windPane')){
    const p = map.createPane('windPane');
    p.style.zIndex = 360; p.style.pointerEvents = 'none';
  }
  const pane = map.getPane('windPane');
  const cv = document.createElement('canvas');
  cv.style.position = 'absolute';
  pane.appendChild(cv);
  const ctx = cv.getContext('2d');
  const reduced = window.matchMedia('(prefers-reduced-motion: reduce)').matches;
  const P = [];
  const NP = 850, LIFE = 90, SPEEDUP = 620;
  const A = {alive:true, raf:0, tmo:0, cv, place:null};

  function place(){
    const sz = map.getSize();
    if(cv.width !== sz.x || cv.height !== sz.y){ cv.width = sz.x; cv.height = sz.y; }
    L.DomUtil.setPosition(cv, map.containerPointToLayerPoint([0,0]));
  }
  A.place = place;
  function seed(p){
    const sz = map.getSize();
    p.x = Math.random()*sz.x; p.y = Math.random()*sz.y; p.age = Math.random()*LIFE;
  }
  for(let i=0;i<NP;i++){ const p = {}; seed(p); P.push(p); }
  place();
  map.on('move zoom resize', place);
  const reseed = () => P.forEach(seed);
  map.on('moveend zoomend', reseed);
  A.reseed = reseed;

  function arrows(){
    place();
    ctx.clearRect(0,0,cv.width,cv.height);
    const step = 58;
    ctx.strokeStyle = 'rgba(150,200,255,.75)'; ctx.lineWidth = 1.4;
    for(let y=step/2; y<cv.height; y+=step) for(let x=step/2; x<cv.width; x+=step){
      const ll = map.containerPointToLatLng([x,y]);
      const w = sampleWind(ll.lat, ll.lng);
      const m = Math.hypot(w[0], w[1]); if(m < 0.05) continue;
      const len = Math.min(24, 7+m*3), ax = w[0]/m*len, ay = -w[1]/m*len;
      ctx.beginPath();
      ctx.moveTo(x-ax/2, y-ay/2); ctx.lineTo(x+ax/2, y+ay/2);
      ctx.lineTo(x+ax/2-ax*0.32+ay*0.2, y+ay/2-ay*0.32-ax*0.2);
      ctx.stroke();
    }
  }
  function frame(){
    if(!A.alive) return;
    if(reduced){
      arrows();
      A.tmo = setTimeout(() => { if(A.alive) A.raf = requestAnimationFrame(frame); }, 900);
      return;
    }
    place();
    ctx.globalCompositeOperation = 'destination-out';
    ctx.fillStyle = 'rgba(0,0,0,0.085)';
    ctx.fillRect(0,0,cv.width,cv.height);
    ctx.globalCompositeOperation = 'source-over';
    ctx.lineCap = 'round';
    const z = map.getZoom(), ctr = map.getCenter();
    const mpp = 40075016.686*Math.cos(ctr.lat*Math.PI/180)/(256*Math.pow(2,z));
    const dt = 1/60;
    for(let i=0;i<P.length;i++){
      const p = P[i];
      if(p.age++ > LIFE || p.x < -20 || p.y < -20 || p.x > cv.width+20 || p.y > cv.height+20){ seed(p); continue; }
      const ll = map.containerPointToLatLng([p.x, p.y]);
      const w = sampleWind(ll.lat, ll.lng);
      const m = Math.hypot(w[0], w[1]);
      const dx = w[0]/mpp*dt*SPEEDUP, dy = -w[1]/mpp*dt*SPEEDUP;
      ctx.strokeStyle = 'rgba(' + (m > 5 ? '190,225,255' : '135,190,240') + ',' + Math.min(.85, .25+m*0.11) + ')';
      ctx.lineWidth = m > 5 ? 1.5 : 1.1;
      ctx.beginPath(); ctx.moveTo(p.x, p.y); ctx.lineTo(p.x+dx, p.y+dy); ctx.stroke();
      p.x += dx; p.y += dy;
    }
    A.raf = requestAnimationFrame(frame);
  }
  A.raf = requestAnimationFrame(frame);
  windAnim = A;
}
function stopWind(){
  const A = windAnim;
  windAnim = null;
  if(!A) return;
  A.alive = false;
  if(A.raf) cancelAnimationFrame(A.raf);
  if(A.tmo) clearTimeout(A.tmo);
  map.off('move zoom resize', A.place);
  map.off('moveend zoomend', A.reseed);
  if(A.cv.parentNode) A.cv.parentNode.removeChild(A.cv);
}

/* --- ซิงก์ทุกชั้นกับชั่วโมงที่เลือก --- */
function currentHourKey(){
  const h = S.result && S.result.perHour[S.hourIndex];
  return h ? h.t : (S.date + 'T' + S.time);
}
function syncWeather(){
  const bits = [];
  const key = currentHourKey();
  ['radar','sat'].forEach(k => {
    if(!WL[k]) return;
    const kind = k === 'radar' ? 'radar' : 'ir';
    const f = rvFrame(kind, key);
    if(!f) return;
    WL[k].setUrl(rvUrl(kind, f));
    WL[k].setOpacity(+$('wlopa').value);
    const d = new Date(f.time*1000);
    const lbl = String(d.getHours()).padStart(2,'0') + ':' + String(d.getMinutes()).padStart(2,'0');
    const drift = Math.abs(f.time - new Date(key + ':00').getTime()/1000)/60;
    bits.push('<b>' + (k==='radar'?'เรดาร์ฝน':'อินฟราเรด') + '</b> ' + lbl + ' น.' +
              (drift > 45 ? ' <span style="color:var(--b4)">(ห่างจากชั่วโมงที่เลือก ' + Math.round(drift/60) + ' ชม.)</span>' : ''));
  });
  if(WL.gibs) bits.push('<b>ภาพดาวเทียม NASA</b> ' + S.date);
  if(WL.fire) bits.push('<b>จุดความร้อน VIIRS</b> ' + S.date);
  if(windAnim) bits.push('<b>สนามลม</b> ' + (windGrid ? 'กริด 6×6 จาก Open-Meteo' : 'ค่าลมของชั่วโมงนี้'));
  wlSay(bits.join('<br>'));
  $('wltag').textContent = bits.length ? bits.length + ' ชั้น' : '';
}

/* --- wiring --- */
$('lyRadar').onchange = e => toggleRV('radar', e.target.checked);
$('lySat').onchange   = e => toggleRV('ir', e.target.checked);
$('lyGibs').onchange  = e => toggleGibs('true', e.target.checked);
$('lyFire').onchange  = e => toggleGibs('fire', e.target.checked);
$('lyWind').onchange  = async e => {
  if(!e.target.checked){ stopWind(); syncWeather(); return; }
  startWind();
  syncWeather();
  if(!windGrid){
    try{ await fetchWindGrid(); syncWeather(); }
    catch(err){ $('netnote').innerHTML = '<div class="warnbox">' + netFail('กริดลม Open-Meteo', err) +
      ' — ตอนนี้แสดงลมของชั่วโมงที่เลือกแบบสม่ำเสมอทั้งพื้นที่แทน</div>'; }
  }
};
$('wlopa').oninput = () => { ['radar','sat','gibs'].forEach(k => { if(WL[k]) WL[k].setOpacity(+$('wlopa').value); }); };
if(OFFLINE){
  $('netnote').innerHTML = '<div class="warnbox">คุณเปิดไฟล์นี้แบบ <b>file://</b> เบราว์เซอร์จะบล็อกการเรียก API ภายนอกทั้งหมด (พยากรณ์อากาศ เรดาร์ OpenStreetMap) ' +
    'ให้เปิดเทอร์มินัลที่โฟลเดอร์นี้แล้วสั่ง <b>npm run dev -w app</b> จากนั้นเข้า <b>http://localhost:5180/</b></div>';
}

/* ---------------- 3D mode (MapLibre + terrain) ---------------- */
let m3 = null, is3D = false, m3ready = false;
let maplibregl = null;   // โหลดตอนกด 3D เท่านั้น bundle แรกจึงไม่แบก ~800 KB
const DEM = 'https://s3.amazonaws.com/elevation-tiles-prod/terrarium/{z}/{x}/{y}.png';
const SATURL = 'https://server.arcgisonline.com/ArcGIS/rest/services/World_Imagery/MapServer/tile/{z}/{y}/{x}';

/* Briggs sigmas — สำเนาฝั่ง main สำหรับสร้างรูปทรง */
function sig(x, st){
  const f = 1/Math.sqrt(1+1e-4*x);
  switch(st){
    case 'A': return [0.22*x*f, 0.20*x];
    case 'B': return [0.16*x*f, 0.12*x];
    case 'C': return [0.11*x*f, 0.08*x/Math.sqrt(1+2e-4*x)];
    case 'D': return [0.08*x*f, 0.06*x/Math.sqrt(1+1.5e-3*x)];
    case 'E': return [0.06*x*f, 0.03*x/(1+3e-4*x)];
    default : return [0.04*x*f, 0.016*x/(1+3e-4*x)];
  }
}
function mixHex(a, b, t){
  const pa = [1,3,5].map(i => parseInt(a.substr(i,2),16));
  const pb = [1,3,5].map(i => parseInt(b.substr(i,2),16));
  return '#' + pa.map((v,i) => Math.round(v+(pb[i]-v)*t).toString(16).padStart(2,'0')).join('');
}

/* สร้างปริมาตรพลูมของชั่วโมงที่เลือก เป็นปริซึมต่อกันตามแนวลม */
function plumeVolume(){
  const feats = [];
  if(!S.result || !S.origin) return {type:'FeatureCollection', features:feats};
  const h = S.result.perHour[S.hourIndex];
  if(!h) return {type:'FeatureCollection', features:feats};
  const o = S.origin;
  const th = (270 - h.wdir)*Math.PI/180;
  const ux = Math.cos(th), uy = Math.sin(th), vx = -uy, vy = ux;
  const RM = S.rangeKm*1000;
  const lid = Math.max(h.mix, 60);
  const PE = +$('pexag').value;              // ยกเฉพาะการมองเห็น ไม่กระทบการคำนวณ

  [{q:h.qFl, H:h.Hfl, u:h.uFl, kind:'flaming'},
   {q:h.qSm, H:h.Hsm, u:h.uSm, kind:'smold'}].forEach(Ly => {
    if(!Ly.q || Ly.q <= 0) return;
    const N = 46;
    let prev = null;
    for(let i=0;i<=N;i++){
      const x = Math.pow(i/N, 1.45)*RM + 12;
      let [sy,sz] = sig(x, h.stab);
      sy = Math.sqrt(sy*sy + (h.sy0||10)*(h.sy0||10));
      sz = Math.min(sz, lid/1.3);
      const c = Ly.q/(2*Math.PI*Ly.u*sy*sz)*1e6*(h.tf||0.7);
      const node = {x, w:1.45*sy, top:Math.min(lid*1.05, Ly.H + 1.45*sz), bot:Math.max(0, Ly.H - 1.45*sz), c};
      if(prev){
        if(prev.c < 2.5 && node.c < 2.5){ prev = node; continue; }
        const pts = [[prev.x, prev.w],[node.x, node.w],[node.x, -node.w],[prev.x, -prev.w]]
          .map(([px,py]) => {
            const ll = toLL(px*ux + py*vx, px*uy + py*vy, o);
            return [ll.lng, ll.lat];
          });
        pts.push(pts[0]);
        const cm = (prev.c + node.c)/2;
        const b = bandOf(cm + 6);
        const base = BANDS[Math.max(0,b)] ? BANDS[Math.max(0,b)].c : '#9fb0c4';
        const dilute = Math.max(0, Math.min(0.85, 1 - Math.log10(cm+1)/2.4));
        feats.push({type:'Feature',
          properties:{kind:Ly.kind, tier: cm >= 25 ? 'core' : 'edge',
                      color: mixHex(base, '#b9c6d6', dilute),
                      base: Math.round(Math.min(prev.bot, node.bot)*PE),
                      height: Math.round(Math.max(prev.top, node.top)*PE + 4)},
          geometry:{type:'Polygon', coordinates:[pts]}});
      }
      prev = node;
    }
  });
  return {type:'FeatureCollection', features:feats};
}
function plotsGeo(){
  return {type:'FeatureCollection', features: S.plots.filter(p => p.on !== false).map(p => {
    const ring = p.type === 'point'
      ? (() => { const r = Math.sqrt(p.rai*RAI/Math.PI), a = [];
                 for(let k=0;k<=24;k++){ const t = k/24*2*Math.PI;
                   const ll = toLL(r*Math.cos(t), r*Math.sin(t), p.latlng); a.push([ll.lng, ll.lat]); }
                 return a; })()
      : p.latlngs.map(c => [c.lng, c.lat]).concat([[p.latlngs[0].lng, p.latlngs[0].lat]]);
    return {type:'Feature', properties:{}, geometry:{type:'Polygon', coordinates:[ring]}};
  })};
}
function recsGeo(){
  const BG = curBg();
  return {type:'FeatureCollection', features: S.receptors.map((r,i) => ({
    type:'Feature',
    properties:{color: S.result ? recColor(recValue(i)+BG) : '#6b7c92', name: r.name},
    geometry:{type:'Point', coordinates:[r.ll.lng, r.ll.lat]}
  }))};
}
function skyFor(hourKey){
  const hh = +(hourKey||'').slice(11,13) || 12;
  if(hh < 6 || hh >= 19) return {sky:'#0b1220', hor:'#1d2a3d', fog:'#141d2a'};
  if(hh < 8)  return {sky:'#4a5f86', hor:'#e0a765', fog:'#c8b49a'};
  if(hh < 16) return {sky:'#5f8fc4', hor:'#b9cbdc', fog:'#c3ceda'};
  return {sky:'#3f5c88', hor:'#e09a5e', fog:'#c2ae97'};
}

function init3D(){
  if(m3) return;
  const c = map.getCenter();
  m3 = new maplibregl.Map({
    container: 'map3d',
    style: {
      version: 8,
      sources: {
        sat:  {type:'raster', tiles:[SATURL], tileSize:256, maxzoom:19,
               attribution:'&copy; Esri, Maxar · ภูมิประเทศ Terrain Tiles (AWS Open Data)'},
        dem:  {type:'raster-dem', tiles:[DEM], tileSize:256, maxzoom:14, encoding:'terrarium'},
        plumeimg: {type:'image', url:'data:image/png;base64,iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mNkYAAAAAYAAjCB0C8AAAAASUVORK5CYII=',
                   coordinates:[[c.lng-0.01,c.lat+0.01],[c.lng+0.01,c.lat+0.01],[c.lng+0.01,c.lat-0.01],[c.lng-0.01,c.lat-0.01]]},
        vol:  {type:'geojson', data:{type:'FeatureCollection', features:[]}},
        plots:{type:'geojson', data:{type:'FeatureCollection', features:[]}},
        recs: {type:'geojson', data:{type:'FeatureCollection', features:[]}},
      },
      layers: [
        {id:'bg', type:'background', paint:{'background-color':'#1d2836'}},
        {id:'sat', type:'raster', source:'sat'},
        {id:'plumeimg', type:'raster', source:'plumeimg', paint:{'raster-opacity':0.75}},
        {id:'plots-fill', type:'fill', source:'plots', paint:{'fill-color':'#e0553f','fill-opacity':0.55}},
        {id:'plots-line', type:'line', source:'plots', paint:{'line-color':'#ff8a6a','line-width':2}},
        ...['flaming','smold'].flatMap(k => ['edge','core'].map(t => ({
          id:'vol-'+k+'-'+t, type:'fill-extrusion', source:'vol',
          filter:['all',['==',['get','kind'],k],['==',['get','tier'],t]],
          paint:{'fill-extrusion-color':['get','color'], 'fill-extrusion-base':['get','base'],
                 'fill-extrusion-height':['get','height'], 'fill-extrusion-opacity':0.4}
        }))),
        {id:'recs', type:'circle', source:'recs',
         paint:{'circle-radius':5,'circle-color':['get','color'],'circle-stroke-color':'#0e141c','circle-stroke-width':1.5}},
      ],
    },
    center:[c.lng, c.lat], zoom: Math.max(11, map.getZoom()-0.4), pitch:64, bearing:0,
    maxPitch:80,
  });
  m3.addControl(new maplibregl.NavigationControl({visualizePitch:true}), 'top-right');
  // อย่าผูกกับ event 'load' เพราะถ้าไทล์ค้างมันจะไม่ยิง ใช้สถานะของ style แทน
  m3.on('styledata', () => {
    if(!m3ready && m3.isStyleLoaded()){
      m3ready = true;
      try{ m3.setTerrain({source:'dem', exaggeration:+$('exag').value}); }catch(e){}
      try{ m3.addControl(new maplibregl.TerrainControl({source:'dem'})); }catch(e){}
    }
    update3D();
  });
  m3.once('idle', update3D);
  m3.on('error', e => {
    const msg = (e && e.error && e.error.message) || '';
    if(/dem|elevation/i.test(msg)) $('netnote').innerHTML =
      '<div class="warnbox">โหลดข้อมูลความสูงภูมิประเทศไม่ได้ — โหมด 3D จะแสดงเป็นพื้นราบ ' +
      (OFFLINE ? 'สาเหตุคือเปิดแบบ file://' : '') + '</div>';
  });
}

function diag(html){
  const el = $('m3diag');
  if(!html){ el.style.display = 'none'; return; }
  el.innerHTML = html; el.style.display = 'block';
}
function update3D(){
  if(!m3 || !m3.isStyleLoaded()) return;
  try{
    m3.getSource('vol').setData(plumeVolume());
    m3.getSource('plots').setData(plotsGeo());
    m3.getSource('recs').setData(recsGeo());
    const showGround = $('showGroundLayer').checked;
    m3.setLayoutProperty('plumeimg','visibility', showGround ? 'visible' : 'none');
    if(showGround && S.lastRaster){
      const b = S.lastRaster.bounds;
      m3.getSource('plumeimg').updateImage({
        url: S.lastRaster.url,
        coordinates: [[b.west,b.north],[b.east,b.north],[b.east,b.south],[b.west,b.south]]
      });
    }
    const op = +$('smokeopa').value;
    m3.setPaintProperty('vol-smold-core',  'fill-extrusion-opacity', op);
    m3.setPaintProperty('vol-smold-edge',  'fill-extrusion-opacity', op*0.30);
    m3.setPaintProperty('vol-flaming-core','fill-extrusion-opacity', op*0.66);
    m3.setPaintProperty('vol-flaming-edge','fill-extrusion-opacity', op*0.16);
    m3.setPaintProperty('plumeimg','raster-opacity', Math.min(1, op*1.3));
    const sk = skyFor(currentHourKey());
    try{ m3.setSky({'sky-color':sk.sky,'horizon-color':sk.hor,'fog-color':sk.fog,
                    'horizon-fog-blend':0.55,'sky-horizon-blend':0.7,'fog-ground-blend':0.6}); }catch(e){}
  }catch(e){ /* style ยังไม่พร้อม */ }
}

async function set3D(on){
  if(on && !maplibregl){
    try{
      maplibregl = (await import('maplibre-gl')).default;
      await import('maplibre-gl/dist/maplibre-gl.css');
    }catch(err){ maplibregl = null; }
  }
  if(on && !maplibregl){
    $('netnote').innerHTML = '<div class="errbox">โหลดไลบรารี MapLibre GL ไม่ได้ จึงเปิดโหมด 3D ไม่ได้' +
      (OFFLINE ? ' — น่าจะเพราะเปิดแบบ file://' : ' — ตรวจการเชื่อมต่อเครือข่าย') + '</div>';
    return;
  }
  is3D = on;
  document.body.classList.toggle('is3d', on);
  $('b2d').setAttribute('aria-pressed', !on);
  $('b3d').setAttribute('aria-pressed', on);
  // ต้องระบุค่าจริง ไม่ใช่ '' เพราะสองอันนี้ถูกตั้ง display:none ไว้ใน stylesheet
  $('map').style.display  = on ? 'none' : 'block';
  $('map3d').style.display = on ? 'block' : 'none';
  $('d3bar').style.display = on ? 'block' : 'none';
  if(!on) diag(null);
  if(on){
    init3D();                                  // สร้างหลังคอนเทนเนอร์มีขนาดแล้ว
    const c = map.getCenter();
    if(m3){
      m3.resize();
      m3.jumpTo({center:[c.lng,c.lat], zoom:Math.max(11, map.getZoom()-0.4)});
    }
    requestAnimationFrame(() => { if(m3){ m3.resize(); update3D(); } });
    diag('<span class="spin"></span> กำลังเริ่มแผนที่ 3 มิติ…');
    let tries = 0;
    const kick = setInterval(() => {
      if(!m3){ clearInterval(kick); return; }
      m3.resize();
      const cw = m3.getCanvas().width;
      if(m3.isStyleLoaded() && cw > 100){ update3D(); clearInterval(kick); diag(null); return; }
      if(++tries > 40){
        clearInterval(kick);
        diag('<b>แผนที่ 3 มิติเริ่มไม่สำเร็จ</b><br>ขนาดภาพวาด ' + cw + '×' + m3.getCanvas().height +
             ' · สไตล์พร้อม ' + (m3.isStyleLoaded() ? 'ใช่' : 'ไม่') +
             ' · ชิ้นส่วนควัน ' + plumeVolume().features.length +
             '<br>ถ้าขนาดเป็น 400×300 แปลว่าไฟล์ที่โหลดยังเป็นเวอร์ชันเก่า กด <code>Cmd+Shift+R</code>');
      }
    }, 150);
  }else if(m3){
    const c = m3.getCenter();
    map.setView([c.lat, c.lng], Math.round(m3.getZoom()+0.4));
    map.invalidateSize();
  }
}
window.addEventListener('resize', () => { if(is3D && m3) m3.resize(); });
$('b2d').onclick = () => set3D(false);
$('b3d').onclick = () => set3D(true);
$('exag').oninput = () => {
  $('exagtxt').textContent = (+$('exag').value).toFixed(1) + '×';
  if(m3 && m3ready){ try{ m3.setTerrain({source:'dem', exaggeration:+$('exag').value}); }catch(e){} }
};
$('smokeopa').oninput = () => {
  $('smokeopatxt').textContent = Math.round(+$('smokeopa').value*100) + '%';
  update3D();
};
$('pexag').oninput = () => {
  $('pexagtxt').textContent = (+$('pexag').value).toFixed(1).replace('.0','') + '×';
  update3D();
};
$('showGroundLayer').onchange = update3D;
$('bAlign').onclick = () => {
  if(!m3 || !S.result) return;
  const h = S.result.perHour[S.hourIndex];
  const bearing = ((h ? h.wdir : 0) + 180) % 360;
  const c = S.origin || map.getCenter();
  m3.easeTo({center:[c.lng, c.lat], bearing, pitch:70, duration:900});
};

/* ---------------- timeline + playback ---------------- */
let playTimer = null;

function renderTimeline(){
  const tl = $('timeline');
  if(!S.result){ tl.style.display = 'none'; setPlaying(false); return; }
  const hrs = S.result.perHour;
  tl.style.display = '';
  const peak = Math.max(...hrs.map(h => h.max), 1);
  $('tlmeta').textContent = hrs.length + ' ชม. · ' + (S.wxMode==='auto' && S.wx ? 'พยากรณ์จริง' : 'ค่าที่กำหนดเอง');
  $('bPlay').disabled = hrs.length < 2;
  const t = $('tltrack');
  t.innerHTML = '';
  hrs.forEach((h,i) => {
    const d = document.createElement('div');
    d.className = 'hr' + (h.precip > 0.05 ? ' rain' : '');
    d.dataset.i = i;
    d.innerHTML = '<div class="st">' + h.stab + '</div>' +
      '<div class="t">' + h.t.slice(11) + '</div>' +
      '<div class="ar" style="transform:rotate(' + (h.wdir+180) + 'deg)">↑</div>' +
      '<div class="ws">' + fmt(h.ws,1) + '</div>' +
      '<div class="bar" style="width:' + Math.max(6, 100*h.max/peak) + '%;background:' + recColor(h.max+curBg()) + '"></div>';
    d.onclick = () => { setPlaying(false); gotoHour(i); };
    t.appendChild(d);
  });
  highlightHour();
}

function highlightHour(){
  const hrs = S.result ? S.result.perHour : [];
  const cur = hrs[S.hourIndex];
  $('tltitle').textContent = S.view === 'hour'
    ? (cur ? cur.t.slice(11) + ' น.' : '')
    : (S.view === 'max' ? 'พีคสูงสุดตลอดการเผา' : 'เฉลี่ย 24 ชั่วโมง');
  const track = $('tltrack');
  track.querySelectorAll('.hr').forEach(n => {
    const on = S.view === 'hour' && +n.dataset.i === S.hourIndex;
    n.classList.toggle('sel', on);
    if(on){
      const l = n.offsetLeft, w = n.offsetWidth, sl = track.scrollLeft, cw = track.clientWidth;
      if(l < sl || l + w > sl + cw) track.scrollLeft = l - cw/2 + w/2;
    }
  });
}

function gotoHour(i){
  if(!S.result) return;
  const n = S.result.perHour.length;
  S.hourIndex = ((i % n) + n) % n;
  if(S.view !== 'hour'){ S.view = 'hour'; syncView(); }
  refresh();
}

function setPlaying(on){
  if(on){
    if(!S.result || S.result.perHour.length < 2) return;
    if(playTimer) return;
    if(S.view !== 'hour'){ S.view = 'hour'; syncView(); refresh(); }
    const step = +$('tlspeed').value;
    playTimer = setInterval(() => {
      const n = S.result ? S.result.perHour.length : 0;
      if(!n){ setPlaying(false); return; }
      if(S.hourIndex >= n-1 && !$('tlloop').checked){ setPlaying(false); return; }
      S.hourIndex = (S.hourIndex + 1) % n;
      refresh();
    }, step);
    $('bPlay').textContent = '❚❚';
    $('bPlay').classList.add('on');
  }else{
    clearInterval(playTimer); playTimer = null;
    $('bPlay').textContent = '▶';
    $('bPlay').classList.remove('on');
  }
}
$('bPlay').onclick  = () => setPlaying(!playTimer);
$('bStepB').onclick = () => { setPlaying(false); gotoHour(S.hourIndex - 1); };
$('bStepF').onclick = () => { setPlaying(false); gotoHour(S.hourIndex + 1); };

document.addEventListener('keydown', e => {
  const tag = (e.target.tagName || '').toLowerCase();
  if(tag === 'input' || tag === 'select' || tag === 'textarea') return;
  if(e.code === 'Space'){ e.preventDefault(); setPlaying(!playTimer); }
  else if(e.key === 'ArrowLeft'){ setPlaying(false); gotoHour(S.hourIndex - 1); }
  else if(e.key === 'ArrowRight'){ setPlaying(false); gotoHour(S.hourIndex + 1); }
});

/* ---------------- export ---------------- */
function download(name, text, mime){
  const a = document.createElement('a');
  a.href = URL.createObjectURL(new Blob([text], {type: mime || 'text/plain;charset=utf-8'}));
  a.download = name; a.click();
  setTimeout(() => URL.revokeObjectURL(a.href), 4000);
}
function exportCsv(){
  if(!S.result || !S.receptors.length){ alert('ต้องมีผลจำลองและจุดอ่อนไหวก่อน'); return; }
  const r = S.result;
  const head = ['ชื่อ','ประเภท','ละติจูด','ลองจิจูด','ระยะ_กม','PM25_ชั่วโมงที่เลือก','PM25_พีคสูงสุด','PM25_เฉลี่ย24ชม','เกินมาตรฐาน37.5'];
  const rows = S.receptors.map((rc,i) => {
    const [x,y] = toXY(rc.ll, S.origin);
    const BG = curBg();
    const hv = (r.recPerHour[S.hourIndex]||r.recPerHour[0])[i]+BG, mv = r.recMax[i]+BG, dv = r.recDose[i]/24+BG;
    return [rc.name.replace(/[",]/g,' '), REC_TH[rc.kind]||rc.kind, rc.ll.lat.toFixed(6), rc.ll.lng.toFixed(6),
            (Math.hypot(x,y)/1000).toFixed(2), hv.toFixed(1), mv.toFixed(1), dv.toFixed(1), dv>=37.5?'ใช่':'ไม่'];
  });
  const csv = '\uFEFF' + [head, ...rows].map(a => a.join(',')).join('\n');
  download('smoke-receptors.csv', csv, 'text/csv;charset=utf-8');
}
function exportGeo(){
  if(!S.contours || !S.contours.length){ alert('ยังไม่มีเส้นชั้นความเข้มข้น'); return; }
  const plots = S.plots.filter(p => p.on!==false).map(p => ({
    type:'Feature', properties:{kind:'burn_plot', fuel:FUELS[p.fuel].n, rai:+(plotArea(p)/RAI).toFixed(2)},
    geometry: p.type==='point'
      ? {type:'Point', coordinates:[p.latlng.lng, p.latlng.lat]}
      : {type:'Polygon', coordinates:[p.latlngs.map(c => [c.lng, c.lat]).concat([[p.latlngs[0].lng, p.latlngs[0].lat]])]}
  }));
  const fc = {type:'FeatureCollection', features: plots.concat(S.contours)};
  download('smoke-plume.geojson', JSON.stringify(fc), 'application/geo+json');
}
function saveScenario(){
  const data = {v:1, plots:S.plots.map(p => ({...p,
      latlng: p.latlng ? [p.latlng.lat,p.latlng.lng] : null,
      latlngs: p.latlngs ? p.latlngs.map(c => [c.lat,c.lng]) : null})),
    receptors:S.receptors.map(r => ({name:r.name, kind:r.kind, src:r.src, ll:[r.ll.lat,r.ll.lng]})),
    date:S.date, time:S.time, dur:S.dur, bg:S.bg, bgAuto:S.bgAuto, man:S.man, wxMode:S.wxMode,
    rangeKm:S.rangeKm, res:S.res, pop:S.pop, depo:S.depo, center:[map.getCenter().lat,map.getCenter().lng], zoom:map.getZoom()};
  download('smoke-scenario.json', JSON.stringify(data,null,1), 'application/json');
}
function loadScenario(txt){
  try{
    const d = JSON.parse(txt);
    S.plots = (d.plots||[]).map(p => ({...p,
      latlng: p.latlng ? L.latLng(p.latlng[0],p.latlng[1]) : null,
      latlngs: p.latlngs ? p.latlngs.map(c => L.latLng(c[0],c[1])) : null}));
    S.nextId = Math.max(1, ...S.plots.map(p => p.id||0)) + 1;
    S.sel = S.plots.length ? S.plots[0].id : null;
    S.receptors = (d.receptors||[]).map(r => ({name:r.name, kind:r.kind, src:r.src, ll:L.latLng(r.ll[0],r.ll[1])}));
    Object.assign(S, {date:d.date||S.date, time:d.time||S.time, dur:d.dur||S.dur, bg:d.bg??S.bg,
      man:d.man||S.man, wxMode:d.wxMode||'auto', rangeKm:d.rangeKm||10, res:d.res||180, bgAuto:!!d.bgAuto,
      pop:d.pop??180, depo:d.depo!==false});
    if(d.center) map.setView(d.center, d.zoom||13);
    syncAllInputs(); redrawPlots(); redrawRecs(); syncEditor(); schedule();
  }catch(e){ alert('ไฟล์ไม่ถูกต้อง: ' + e.message); }
}

/* ---------------- map interaction ---------------- */
map.on('click', e => {
  if(S.recPlacing){
    S.receptors.push({ll:e.latlng, name:'จุดที่ ' + (S.receptors.filter(r=>r.src==='manual').length+1), kind:'manual', src:'manual'});
    redrawRecs(); schedule(); return;
  }
  if(S.mode === 'point'){
    addPlot({type:'point', latlng:e.latlng, rai:20});
  }else{
    S.draft.push(e.latlng);
    $('bFinish').style.display = S.draft.length >= 3 ? '' : 'none';
    $('bUndo').style.display = '';
    redrawPlots();
  }
});

/* ---------------- UI wiring ---------------- */
$('basesel').innerHTML = BASEMAPS.map((b,i) => '<option value="' + i + '">' + b.n + '</option>').join('');
$('basesel').onchange = () => { tried = BASEMAPS.length; setBase(+$('basesel').value, true); };
$('fuel').innerHTML = Object.entries(FUELS).map(([k,v]) => '<option value="' + k + '">' + v.n + '</option>').join('');
$('stab').innerHTML = Object.entries(STAB).map(([k,v]) => '<option value="' + k + '">' + v + '</option>').join('');
$('legrows').innerHTML = BANDS.map(b => '<div class="l"><i style="background:' + b.c + '"></i>' +
  b.lo + (b.hi ? '–' + b.hi : '+') + ' · ' + b.n + '</div>').join('');

function setMode(m){
  S.mode = m;
  $('mPoint').setAttribute('aria-pressed', m==='point');
  $('mPoly').setAttribute('aria-pressed', m==='poly');
  $('mhint').textContent = m==='point'
    ? 'คลิกบนแผนที่เพื่อเพิ่มแปลง แล้วปรับขนาดเป็นไร่ในหัวข้อถัดไป เพิ่มได้หลายแปลงเพื่อดูผลสะสม'
    : 'คลิกไล่ตามมุมแปลงจริง (ใช้ภาพดาวเทียมจะแม่นที่สุด) ครบแล้วกดปิดรูป';
  S.draft = []; $('bFinish').style.display='none'; $('bUndo').style.display='none';
  redrawPlots();
}
$('mPoint').onclick = () => setMode('point');
$('mPoly').onclick  = () => setMode('poly');
$('bFinish').onclick = () => {
  if(S.draft.length < 3) return;
  addPlot({type:'poly', latlngs:S.draft.slice()});
  S.draft = []; $('bFinish').style.display='none'; $('bUndo').style.display='none';
};
$('bUndo').onclick = () => {
  S.draft.pop();
  $('bFinish').style.display = S.draft.length>=3 ? '' : 'none';
  if(!S.draft.length) $('bUndo').style.display='none';
  redrawPlots();
};

function bindPlotNum(id, key){
  $(id).oninput = () => {
    const p = currentPlot(); if(!p) return;
    const v = parseFloat($(id).value); if(isNaN(v)) return;
    p[key] = v; redrawPlots(); schedule();
  };
}
bindPlotNum('rai','rai'); bindPlotNum('load','load'); bindPlotNum('ef','ef'); bindPlotNum('cc','cc');
$('fuel').onchange = () => {
  const p = currentPlot(); if(!p) return;
  const f = FUELS[$('fuel').value];
  p.fuel = $('fuel').value; p.load = f.load; p.ef = f.ef; p.cc = f.cc;
  syncEditor(); renderPlotList(); schedule();
};
$('moist').oninput = () => { const p = currentPlot(); if(!p) return; p.moist = +$('moist').value; syncEditor(); schedule(); };

$('bdate').onchange = () => {
  S.date = $('bdate').value;
  if(WL.gibs) toggleGibs('true', true);
  if(WL.fire) toggleGibs('fire', true);
  schedule();
};
$('btime').onchange = () => { S.time = $('btime').value; schedule(); };
$('bdur').oninput   = () => { S.dur = Math.max(1, Math.min(12, +$('bdur').value||1)); S.hourIndex = 0; schedule(); };

function setWxMode(m){
  S.wxMode = m;
  $('wAuto').setAttribute('aria-pressed', m==='auto');
  $('wMan').setAttribute('aria-pressed', m==='man');
  $('wxAuto').style.display = m==='auto' ? '' : 'none';
  $('wxMan').style.display  = m==='man' ? '' : 'none';
  if(m==='man') $('wxsrc').textContent = 'กำหนดเอง';
  schedule();
}
$('wAuto').onclick = () => setWxMode('auto');
$('wMan').onclick  = () => setWxMode('man');
$('bFetchWx').onclick = fetchWeather;
$('wdir').oninput = () => { S.man.wdir = +$('wdir').value; $('wdtxt').textContent = S.man.wdir + '° ' + compass(S.man.wdir); schedule(); };
$('wspd').oninput = () => { S.man.ws = +$('wspd').value; $('wstxt').textContent = fmt(S.man.ws,1) + ' ม./วิ'; schedule(); };
$('stab').onchange = () => { S.man.stab = $('stab').value; schedule(); };
$('mix').oninput  = () => { S.man.mix = +$('mix').value || 300; schedule(); };
$('bg').oninput   = () => { S.bg = +$('bg').value || 0; refresh(); };
$('bgAuto').onchange = () => {
  S.bgAuto = $('bgAuto').checked;
  if(S.bgAuto && !S.bgSeries) setWxStatus('ยังไม่มีค่าพื้นหลังรายชั่วโมง — กดดึงพยากรณ์อากาศก่อน', true);
  refresh();
};

$('bOsm').onclick = fetchOsm;
$('bManualRec').onclick = function(){
  S.recPlacing = !S.recPlacing;
  this.textContent = S.recPlacing ? 'กำลังปักหมุด… (กดเพื่อหยุด)' : 'ปักหมุดจุดเองบนแผนที่';
  this.style.borderColor = S.recPlacing ? 'var(--hot)' : '';
};

$('range').onchange = () => { S.rangeKm = +$('range').value; schedule(); };
$('res').onchange   = () => { S.res = +$('res').value; schedule(); };
$('pop').oninput    = () => { S.pop = +$('pop').value || 0; renderPanel(); };
$('tlspeed').onchange = () => { if(playTimer){ setPlaying(false); setPlaying(true); } };
$('opa').oninput    = () => { S.opacity = +$('opa').value; if(S.result) drawOverlay(currentGrid()); };
$('depo').onchange  = () => { S.depo = $('depo').checked; schedule(); };

function syncView(){
  $('vHour').setAttribute('aria-pressed', S.view==='hour');
  $('vMax').setAttribute('aria-pressed', S.view==='max');
  $('vDose').setAttribute('aria-pressed', S.view==='dose');
  $('legh').textContent = S.view==='dose' ? 'PM2.5 เฉลี่ย 24 ชม. (µg/m³)' : 'PM2.5 (µg/m³)';
}
$('vHour').onclick = () => { S.view='hour'; syncView(); refresh(); };
$('vMax').onclick  = () => { setPlaying(false); S.view='max';  syncView(); refresh(); };
$('vDose').onclick = () => { setPlaying(false); S.view='dose'; syncView(); refresh(); };

function setTab(t){
  S.tab = t;
  $('tSum').setAttribute('aria-pressed', t==='sum');
  $('tRec').setAttribute('aria-pressed', t==='rec');
  $('tMet').setAttribute('aria-pressed', t==='met');
  renderPanel();
}
$('tSum').onclick = () => setTab('sum');
$('tRec').onclick = () => setTab('rec');
$('tMet').onclick = () => setTab('met');

$('bFit').onclick = () => {
  const pts = [];
  S.plots.forEach(p => p.type==='point' ? pts.push(p.latlng) : pts.push(...p.latlngs));
  S.receptors.forEach(r => pts.push(r.ll));
  if(!pts.length) return;
  const bb = L.latLngBounds(pts).pad(0.25);
  map.fitBounds(bb);
  if(is3D && m3) m3.fitBounds([[bb.getWest(),bb.getSouth()],[bb.getEast(),bb.getNorth()]],
                              {pitch:64, duration:800, padding:60});
};
$('bCsv').onclick = exportCsv;
$('bGeo').onclick = exportGeo;
$('bSave').onclick = saveScenario;
$('bLoad').onclick = () => $('fileIn').click();
$('fileIn').onchange = e => {
  const f = e.target.files[0]; if(!f) return;
  const fr = new FileReader(); fr.onload = () => loadScenario(fr.result); fr.readAsText(f);
  e.target.value = '';
};
$('bReset').onclick = () => {
  if(!confirm('ล้างแปลง จุดอ่อนไหว และผลทั้งหมด?')) return;
  setPlaying(false);
  S.plots = []; S.receptors = []; S.draft = []; S.sel = null; S.result = null;
  clearOverlay(); redrawPlots(); redrawRecs(); syncEditor(); renderPanel(); renderTimeline();
};

/* search */
let stim = null;
$('search').addEventListener('input', () => {
  clearTimeout(stim);
  const q = $('search').value.trim();
  if(q.length < 2){ $('sres').style.display='none'; return; }
  stim = setTimeout(async () => {
    const box = $('sres');
    box.style.display='block'; box.innerHTML = '<div class="no"><span class="spin"></span> กำลังค้นหา…</div>';
    try{
      const r = await fetch('https://nominatim.openstreetmap.org/search?format=json&limit=6&countrycodes=th&accept-language=th&q=' + encodeURIComponent(q));
      if(!r.ok) throw new Error(r.status);
      const j = await r.json();
      if(!j.length){ box.innerHTML = '<div class="no">ไม่พบสถานที่นี้</div>'; return; }
      box.innerHTML = '';
      j.forEach(it => {
        const d = document.createElement('div');
        d.textContent = it.display_name.split(',').slice(0,4).join(',');
        d.onclick = () => { map.setView([+it.lat,+it.lon], 15); $('search').value=''; box.style.display='none'; };
        box.appendChild(d);
      });
    }catch(e){ box.innerHTML = '<div class="no">ค้นหาไม่ได้ในสภาพแวดล้อมนี้</div>'; }
  }, 450);
});
$('search').addEventListener('blur', () => setTimeout(() => $('sres').style.display='none', 200));
$('bGeoloc').onclick = () => {
  if(!navigator.geolocation) return alert('เบราว์เซอร์นี้ไม่รองรับ');
  navigator.geolocation.getCurrentPosition(
    p => map.setView([p.coords.latitude, p.coords.longitude], 15),
    () => alert('เข้าถึงตำแหน่งไม่ได้ — ต้องอนุญาตสิทธิ์และเปิดผ่าน https'),
    {enableHighAccuracy:true, timeout:9000});
};

function syncAllInputs(){
  $('bdate').value = S.date; $('btime').value = S.time; $('bdur').value = S.dur;
  $('bg').value = S.bg; $('range').value = S.rangeKm; $('res').value = S.res;
  $('pop').value = S.pop; $('depo').checked = S.depo; $('opa').value = S.opacity;
  $('bgAuto').checked = S.bgAuto;
  $('wdir').value = S.man.wdir; $('wspd').value = S.man.ws; $('stab').value = S.man.stab; $('mix').value = S.man.mix;
  $('wdtxt').textContent = S.man.wdir + '° ' + compass(S.man.wdir);
  $('wstxt').textContent = fmt(S.man.ws,1) + ' ม./วิ';
  setWxMode(S.wxMode);
}

/* ---------------- boot ---------------- */
$('ver').textContent = 'v2026-09-02d';
setBase(0);
syncAllInputs();
setMode('point');
syncView();
setTab('sum');
renderPlotList();
renderPanel();
setWxStatus('ยังไม่ได้ดึงข้อมูล — วางแปลงเผาแล้วกดปุ่มด้านบน หรือสลับไปกำหนดเอง');

/* ---------------- debug handle ---------------- */
/* ES module มี scope ของตัวเอง ตัวแปรระดับบนสุดจึงไม่ขึ้น global เหมือนตอนเป็นไฟล์เดียว
   วิธีทดสอบ UI ที่ HANDOFF เขียนไว้ (page.evaluate เรียก S / addPlot ตรงๆ) จะพังทันที
   จึงเปิดช่องทางที่ตั้งใจไว้ ใช้ได้ตอน dev หรือใส่ ?debug ใน URL */
if(import.meta.env.DEV || new URLSearchParams(location.search).has('debug')){
  window.__MOKHWAN__ = { S, addPlot, setWxMode, syncAllInputs, runSim, engineRun, map };
}
