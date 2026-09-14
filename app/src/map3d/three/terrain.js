/**
 * terrain — เมชภูมิประเทศ และ texture ความสูงที่ shader ของควันใช้ตัดรังสี
 *
 * เงาเขาที่นี่**มาจากแสงจริงส่องเมชที่มี normal** ไม่ใช่ hillshade ที่คำนวณทับภาพ
 * ต่างจากฝั่ง MapLibre ที่ล็อกมุมแสงไว้ 315° ตายตัว — ที่นี่ทิศเงาเปลี่ยนตามเวลาในวันจริง
 *
 * **จุดยอดอยู่ที่ศูนย์กลางเซลล์ เมชจึงกว้าง `2R − cell` ไม่ใช่ `2R`**
 * เซลล์ (i,j) ของเอนจินอยู่ที่ (cx − R + (i+0.5)·cell, cy + R − (j+0.5)·cell)
 * ถ้าปูเมชเต็ม 2R จุดยอดจะไปอยู่ที่มุมเซลล์ เลื่อนจากค่าจริงครึ่งเซลล์
 * แล้วเงาเขากับภาพดาวเทียมจะเหลื่อมกันแบบที่ตาจับได้
 *
 * **`elevTexture` ปูเต็มโดเมน `[cx−R, cx+R]`** เพราะ `LinearFilter` สุ่มที่ศูนย์กลางเท็กเซล
 * คือ `uv = (i+0.5)/N` ซึ่งตกที่ศูนย์กลางเซลล์พอดี shader จึงอ่านความสูงได้ตรงโดยไม่ต้องชดเชย
 * (คนละกรณีกับแกน z ของสนามควัน ดูหมายเหตุใน volume-field.js)
 *
 * เก็บความสูง**ดิบ** ไว้ใน texture ไม่คูณ `exag` — ตัวคูณส่งเป็น uniform แยก
 * ถ้าคูณใส่ texture แล้วต้องอัปโหลดใหม่ทุกครั้งที่เลื่อนสไลเดอร์
 */
import * as THREE from 'three';

export function buildTerrain({ elev, res, exag = 1, texture = null }) {
  const { N, cell, cx, cy } = res;
  const span = 2 * res.R - cell;
  const geo = new THREE.PlaneGeometry(span, span, N - 1, N - 1);
  const pos = geo.attributes.position;

  // PlaneGeometry ไล่จุดยอดจากบนซ้าย (y มากไปน้อย) ตรงกับ j ที่เพิ่มลงใต้พอดี ไม่ต้องพลิก
  const raw = elev && elev.length === N * N ? elev : new Float32Array(N * N);
  for (let k = 0; k < N * N; k++) pos.setZ(k, raw[k] * exag);
  pos.needsUpdate = true;
  geo.computeVertexNormals();

  const mat = new THREE.MeshStandardMaterial({
    map: texture, color: texture ? 0xffffff : 0x5d6b52, roughness: 0.95, metalness: 0,
  });
  const mesh = new THREE.Mesh(geo, mat);
  mesh.position.set(cx, cy, 0);
  mesh.renderOrder = 0;

  const elevTexture = new THREE.DataTexture(raw, N, N, THREE.RedFormat, THREE.FloatType);
  elevTexture.minFilter = elevTexture.magFilter = THREE.LinearFilter;
  elevTexture.wrapS = elevTexture.wrapT = THREE.ClampToEdgeWrapping;
  elevTexture.needsUpdate = true;

  return {
    mesh, elevTexture, raw,
    setExaggeration(v) {
      for (let k = 0; k < N * N; k++) pos.setZ(k, raw[k] * v);
      pos.needsUpdate = true;
      geo.computeVertexNormals();
    },
    setTexture(tex) {
      mat.map = tex;
      mat.color.set(tex ? 0xffffff : 0x5d6b52);
      mat.needsUpdate = true;
    },
    dispose() { geo.dispose(); mat.dispose(); elevTexture.dispose(); },
  };
}
