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
import { createVolume } from './volume-mesh.js';
import { createMarkers, createGroundImage } from './markers.js';
import { sunDirection, isDaylight } from '../sky-palette.js';

const M_LAT = 111320;
const mLon = lat => 111320 * Math.cos(lat * Math.PI / 180);

export async function create3D(container, view) {
  const { origin, result } = view;
  const spanM = result ? 2 * result.R : 20000;
  const stage = createScene(container, { origin, hourKey: view.hourKey, spanM });

  let terrain = null, volume = null, markers = null, ground = null;
  const notes = [];

  if (result) {
    terrain = buildTerrain({ elev: view.elev, res: result, exag: view.opts.exag });
    stage.add(terrain.mesh);
    stage.controls.target.set(result.cx, result.cy, 0);
    stage.camera.position.set(result.cx, result.cy - spanM * 0.9, spanM * 0.28);

    if (!view.elev) notes.push('ไม่มีข้อมูลความสูงภูมิประเทศ — แสดงเป็นพื้นราบ');

    markers = createMarkers({ res: result });
    markers.setTerrain(terrain.raw, view.opts.exag);
    stage.add(markers.group);

    ground = createGroundImage({ res: result });
    stage.add(ground.mesh);

    volume = createVolume({ res: result, elevTexture: terrain.elevTexture,
                           elevMin: terrain.elevMin, elevMax: terrain.elevMax, bands: view.bands });
    stage.add(volume.mesh);
    // shader ทำงานในระบบพิกัดกล่อง จึงต้องบอกตำแหน่งกล้องใหม่ทุกเฟรม ไม่ใช่ตอน update
    stage.onFrame(() => volume.syncCamera(stage.camera));
    const firstNote = pushVolume(view);
    if (firstNote) notes.push(firstNote);
    pushOverlays(view);

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

  /* ย่อให้ได้ราว 160 บล็อกต่อด้านไม่ว่ากริดจะละเอียดแค่ไหน ขนาด texture จึงไม่ผูกกับ
     ความละเอียดที่ผู้ใช้เลือก และ VRAM ไม่บวมตาม · ลองที่ 96 แล้วเห็นขอบเป็นบันไดชัด
     เพราะบล็อกกว้างราว 230 ม. — กล่องถูกย่อให้พอดีพลูมอยู่แล้ว จึงจ่ายไหว */
  /**
   * คืนข้อความเตือนถ้ามี หรือ null
   *
   * **ก้อนควัน 3 มิติแสดงได้เฉพาะมุมมองรายชั่วโมง** เพราะกริด "พีคสูงสุด" กับ
   * "เฉลี่ย 24 ชม." รวมหลายชั่วโมงที่ลมพัดคนละทิศเข้าด้วยกัน แต่ความสูงพลูมกับ σz
   * ที่ใช้ปั้นรูปทรงแนวดิ่งเป็นของ**ชั่วโมงเดียว** จับคู่กันไม่ได้
   *
   * ถ้าฝืนวาด จะได้ภาพทาบพื้นเป็นพัดกว้างหลายแฉก ทับกับก้อนควันที่เป็นริ้วเดียว
   * ชี้คนละทาง — คนดูอ่านแล้วสรุปผิดแน่นอน ยอมไม่แสดงแล้วบอกเหตุผลตรงๆ ดีกว่า
   */
  function pushVolume(v) {
    if (!volume || !v.result) return null;
    if (v.view && v.view !== 'hour') {
      volume.mesh.visible = false;
      return 'มุมมองนี้รวมหลายชั่วโมงที่ลมพัดคนละทิศ จึงแสดงได้แค่ชั้นทาบพื้น — ' +
             'กด “รายชั่วโมง” เพื่อดูก้อนควันสามมิติ';
    }
    const r = v.result;
    const g = r.grids[v.hourIndex] || r.grids[0];
    const h = r.perHour[v.hourIndex];
    /* ตอนกลางคืนดวงอาทิตย์อยู่ใต้ขอบฟ้า ถ้าส่งทิศนั้นไปตรงๆ ควันจะถูกส่องจากใต้ดิน
       ยกขึ้นมาให้เฉียงลงเล็กน้อยแทน เหมือนที่ scene.js ทำกับแสงของภูมิประเทศ */
    const sd = sunDirection(v.hourKey, v.origin.lat);
    if (!isDaylight(v.hourKey)) sd.z = Math.max(sd.z, 0.25);

    volume.update({ grid: g, hour: h, opts: v.opts, bg: v.bg, sunDir: sd,
                    step: Math.max(1, Math.round(r.N / 160)) });
    return null;
  }

  function pushOverlays(v) {
    if (!v.result) return;
    if (markers) {
      markers.setTerrain(terrain ? terrain.raw : null, v.opts.exag);
      markers.update({ plots: v.plots, receptors: v.receptors });
    }
    if (ground) {
      ground.update({
        raster: v.groundRaster, opacity: Math.min(1, v.opts.smokeOpacity * 1.3),
        visible: v.opts.showGroundLayer, raw: terrain ? terrain.raw : null,
        exag: v.opts.exag, origin: v.origin, mLonV: mLon(v.origin.lat), mLatV: M_LAT,
      });
    }
  }

  stage.onQualityDrop(q => {
    if (volume) volume.setSteps(q.steps);
    notes.push('เครื่องวาดไม่ทัน จึงลดความละเอียดลงเอง — กด "แบบเดิม" ถ้ายังหืด');
  });

  /* ช่องทางตรวจสอบเวลาพัฒนาและให้ smoke test เข้าถึงฉากได้
     ใช้เงื่อนไขเดียวกับ `window.__MOKHWAN__` ใน app.js เป๊ะ (DEV หรือ ?debug)
     ไม่งั้นเทสที่รันบน preview build จะเข้าไม่ถึงและผ่านแบบว่างเปล่าโดยไม่มีใครรู้ */
  if ((import.meta.env && import.meta.env.DEV) ||
      new URLSearchParams(location.search).has('debug')) window.__stage3d = stage;
  stage.start();
  let cur = view;

  return {
    notes,
    update(next) {
      stage.setHour(next.hourKey);
      if (terrain && next.opts.exag !== cur.opts.exag) terrain.setExaggeration(next.opts.exag);
      cur = next;
      const note = pushVolume(next);
      pushOverlays(next);
      return note;                      // ผู้เรียกเอาไปแสดง ไม่ให้โมดูลนี้ยุ่งกับ DOM ของแอป
    },
    resize: () => stage.resize(),
    /**
     * หันกล้องไปตามทิศที่ควันลอย — ยืน**ต้นลม**มองไปทางท้ายลม
     * `wdir` คือทิศที่ลม**พัดมาจาก** กล้องจึงต้องไปอยู่ฝั่งนั้น แล้วมองย้อนเข้าหาเป้า
     */
    alignToWind(wdirDeg) {
      const r = cur.result; if (!r) return;
      const a = wdirDeg * Math.PI / 180;
      const d = Math.max(r.R * 1.25, 2000);
      stage.controls.target.set(r.cx, r.cy, 0);
      stage.camera.position.set(r.cx + Math.sin(a) * d, r.cy + Math.cos(a) * d, d * 0.38);
      stage.camera.lookAt(stage.controls.target);
    },
    /** มุมมองภูเขา — ต่ำและใกล้กว่า เพื่อให้อ่านความชันกับการที่ควันชนสันเขาออก */
    ridgeView(wdirDeg) {
      const r = cur.result; if (!r) return;
      const a = wdirDeg * Math.PI / 180;
      const d = Math.max(r.R * 0.85, 1200);
      stage.controls.target.set(r.cx, r.cy, 0);
      stage.camera.position.set(r.cx + Math.sin(a) * d, r.cy + Math.cos(a) * d, d * 0.17);
      stage.camera.lookAt(stage.controls.target);
    },
    fitBounds() {
      const r = cur.result;
      if (!r) return;
      stage.controls.target.set(r.cx, r.cy, 0);
      stage.camera.position.set(r.cx, r.cy - r.R * 1.8, r.R * 0.6);
      stage.camera.lookAt(stage.controls.target);
    },
    dispose() {
      stage.stop();
      if (volume) volume.dispose();
      if (markers) markers.dispose();
      if (ground) ground.dispose();
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
