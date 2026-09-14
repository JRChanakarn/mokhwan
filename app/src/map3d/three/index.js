/**
 * index — facade เดียวที่ `app.js` คุยด้วย
 *
 * ตั้งใจให้ `app.js` ไม่รู้จัก three.js เลยแม้แต่ import เดียว จะได้ถอดหรือเปลี่ยน
 * ตัววาดทีหลังโดยไม่ต้องรื้อไฟล์ 1900 บรรทัด และทำให้ MapLibre เดิมไม่มีทางโดนกระทบ
 *
 * ทั้งโมดูลนี้ถูก `import()` แบบ dynamic จาก `app.js` three.js จึงไม่เข้า bundle แรก
 * เหมือนที่ maplibre-gl ทำอยู่
 *
 * `view` เป็นก้อนข้อมูลธรรมดา ไม่ใช่ `S` ทั้งก้อน — อ่านออกทันทีว่าพึ่งอะไรบ้าง
 */
import * as THREE from 'three';
import { createScene } from './scene.js';
import { buildTerrain } from './terrain.js';
import { loadImageryMosaic } from './basemap.js';

const M_LAT = 111320;
const mLon = lat => 111320 * Math.cos(lat * Math.PI / 180);

export async function create3D(container, view) {
  const { origin, result } = view;
  const spanM = result ? 2 * result.R : 20000;
  const stage = createScene(container, { origin, hourKey: view.hourKey, spanM });

  let terrain = null;
  const notes = [];

  if (result) {
    terrain = buildTerrain({ elev: view.elev, res: result, exag: view.opts.exag });
    stage.add(terrain.mesh);
    stage.controls.target.set(result.cx, result.cy, 0);
    stage.camera.position.set(result.cx, result.cy - spanM * 0.9, spanM * 0.28);

    if (!view.elev) notes.push('ไม่มีข้อมูลความสูงภูมิประเทศ — แสดงเป็นพื้นราบ');

    // โมเสกครอบ 1.4R เท่ากับที่ dem.js ใช้ เพราะ (cx,cy) เลื่อนตามลมได้ถึง 0.32R
    const mos = await loadImageryMosaic(origin, result.R * 1.4);
    if (mos.ok) {
      const tex = new THREE.CanvasTexture(mos.canvas);
      tex.colorSpace = THREE.SRGBColorSpace;
      tex.anisotropy = Math.min(8, stage.renderer.capabilities.getMaxAnisotropy());
      applyDomainUv(terrain.mesh.geometry, result, origin, mos.bounds);
      terrain.setTexture(tex);
      if (mos.got < mos.tiles) notes.push(`ภาพดาวเทียมโหลดได้ ${mos.got}/${mos.tiles} ไทล์ — บางส่วนจะโหว่`);
    } else {
      notes.push(mos.reason);
    }
  } else {
    notes.push('ยังไม่มีผลการคำนวณ — กดคำนวณก่อนจึงจะเห็นภูมิประเทศและควัน');
  }

  stage.onQualityDrop(() => {
    notes.push('เครื่องวาดไม่ทัน จึงลดความละเอียดลงเอง — กด "แบบเดิม" ถ้ายังหืด');
  });

  stage.start();
  let cur = view;

  return {
    notes,
    update(next) {
      stage.setHour(next.hourKey);
      if (terrain && next.opts.exag !== cur.opts.exag) terrain.setExaggeration(next.opts.exag);
      cur = next;
    },
    resize: () => stage.resize(),
    fitBounds() {
      const r = cur.result;
      if (!r) return;
      stage.controls.target.set(r.cx, r.cy, 0);
      stage.camera.position.set(r.cx, r.cy - r.R * 1.8, r.R * 0.6);
    },
    dispose() {
      stage.stop();
      if (terrain) terrain.dispose();
      stage.dispose();
    },
  };
}

/**
 * map UV ของเมชให้ชี้ไปยังส่วนของโมเสกที่ตรงกับโดเมนจริง
 *
 * โมเสกครอบกว้างกว่าโดเมนเสมอเพราะขอบไทล์ไม่มีทางลงตัวพอดี ถ้าใช้ UV 0..1 ตรงๆ
 * ภาพจะถูกยืดให้เต็มโดเมนแล้วเลื่อนจากภูมิประเทศไปหลักร้อยเมตร ซึ่งพอมองออกด้วยตา
 */
function applyDomainUv(geo, res, origin, bounds) {
  const { N, cell, cx, cy, R } = res;
  const mx = mLon(origin.lat);
  const uv = geo.attributes.uv;
  for (let j = 0; j < N; j++) {
    for (let i = 0; i < N; i++) {
      const x = cx - R + (i + 0.5) * cell, y = cy + R - (j + 0.5) * cell;
      const lng = origin.lng + x / mx, lat = origin.lat + y / M_LAT;
      uv.setXY(j * N + i,
        (lng - bounds.west) / (bounds.east - bounds.west),
        (lat - bounds.south) / (bounds.north - bounds.south));
    }
  }
  uv.needsUpdate = true;
}
