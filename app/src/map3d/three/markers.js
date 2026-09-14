/**
 * markers — แปลงเผาและตัวรับในฉาก 3 มิติ
 *
 * ทั้งคู่ปูเลาะผิวดินผ่าน `drape.js` เพราะวางที่ z = 0 แล้วจะจมใต้ภูเขา
 *
 * รับ**พิกัดเอนจินและสีสำเร็จ**มาจาก `app.js` ไม่ใช่ latlng กับกฎการลงสี
 * โมดูลนี้จึงไม่รู้จัก Leaflet และไม่มีโอกาสคิดสีไม่ตรงกับแผนที่ 2D
 */
import * as THREE from 'three';
import { elevAt, drapeRing } from './drape.js';

export function createMarkers({ res }) {
  const group = new THREE.Group();
  let raw = null, exag = 1;
  const own = [];

  function clear() {
    for (const o of own) {
      group.remove(o);
      o.geometry.dispose();
      o.material.dispose();
    }
    own.length = 0;
  }

  return {
    group,
    setTerrain(nextRaw, nextExag) { raw = nextRaw; exag = nextExag; },
    /** `plots` = [{ring:[[x,y],…]}] · `receptors` = [{x,y,color}] ในพิกัดเอนจิน */
    update({ plots = [], receptors = [] }) {
      clear();

      for (const p of plots) {
        if (!p.ring || p.ring.length < 3) continue;
        const g = new THREE.BufferGeometry();
        g.setAttribute('position',
          new THREE.BufferAttribute(drapeRing(p.ring, { raw, res, exag, lift: 10 }), 3));
        const line = new THREE.LineLoop(g, new THREE.LineBasicMaterial({ color: 0xff8a6a }));
        line.renderOrder = 2;
        group.add(line); own.push(line);
      }

      // ทรงกลมเล็กๆ ยกเหนือพื้นพอให้เห็นจากมุมต่ำ แต่ไม่สูงจนดูลอย
      const rad = Math.max(res.cell * 0.5, 45);
      for (const r of receptors) {
        const s = new THREE.Mesh(
          new THREE.SphereGeometry(rad, 10, 8),
          new THREE.MeshBasicMaterial({ color: new THREE.Color(r.color || '#6b7c92') }));
        s.position.set(r.x, r.y, elevAt(raw, res, r.x, r.y) * exag + rad * 1.2);
        s.renderOrder = 2;
        group.add(s); own.push(s);
      }
    },
    dispose() { clear(); },
  };
}

/**
 * ภาพชั้นควัน 2 มิติทาบลงบนพื้น — ระนาบย่อยละเอียดพอจะเลาะภูเขาได้
 *
 * ใช้ภาพ raster ตัวเดียวกับที่แผนที่ 2D วาด (`S.lastRaster`) จึงตรงกันเสมอ
 * โดยไม่ต้องคำนวณอะไรซ้ำ
 */
export function createGroundImage({ res }) {
  const { N, cell, cx, cy, R } = res;
  const seg = Math.min(N - 1, 128);
  const geo = new THREE.PlaneGeometry(2 * R - cell, 2 * R - cell, seg, seg);
  const mat = new THREE.MeshBasicMaterial({ transparent: true, depthWrite: false });
  const mesh = new THREE.Mesh(geo, mat);
  mesh.position.set(cx, cy, 0);
  mesh.renderOrder = 1;
  mesh.visible = false;

  let tex = null, lastUrl = null, lastKey = '';

  return {
    mesh,
    update({ raster, opacity = 1, visible = false, raw = null, exag = 1, origin, mLonV, mLatV }) {
      mesh.visible = !!(visible && raster && raster.url);
      if (!mesh.visible) return;
      mat.opacity = opacity;

      if (raster.url !== lastUrl) {
        if (tex) tex.dispose();
        tex = new THREE.TextureLoader().load(raster.url);
        tex.colorSpace = THREE.SRGBColorSpace;
        mat.map = tex; mat.needsUpdate = true;
        lastUrl = raster.url;
      }

      /* ภาพ raster ครอบขอบเขตของมันเอง ซึ่งไม่เท่าโดเมนเสมอไป — ต้อง map UV ตามขอบเขตจริง
         เหมือนที่ทำกับภาพดาวเทียม ใช้ 0..1 ตรงๆ แล้วควันจะเลื่อนจากที่ที่มันอยู่จริง */
      const b = raster.bounds;
      const key = `${b.west},${b.east},${b.south},${b.north},${exag}`;
      if (key === lastKey) return;
      lastKey = key;

      const pos = geo.attributes.position, uv = geo.attributes.uv;
      for (let k = 0; k < pos.count; k++) {
        const x = cx + pos.getX(k), y = cy + pos.getY(k);
        // ยก 18 ม. ไม่ใช่ 4 — DEM หยาบ 72 ม./จุด พอคูณ exag แล้วผิวเมชกับระนาบนี้
        // แกว่งเข้าหากันบนไหล่เขาชัน เกิดจุดดำประปรายจาก z-fighting
        pos.setZ(k, elevAt(raw, res, x, y) * exag + 18);
        const lng = origin.lng + x / mLonV, lat = origin.lat + y / mLatV;
        uv.setXY(k, (lng - b.west) / (b.east - b.west), (lat - b.south) / (b.north - b.south));
      }
      pos.needsUpdate = true; uv.needsUpdate = true;
    },
    dispose() { if (tex) tex.dispose(); geo.dispose(); mat.dispose(); },
  };
}
