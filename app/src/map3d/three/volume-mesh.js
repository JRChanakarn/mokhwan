/**
 * volume-mesh — ประกอบสนาม 3 มิติ + LUT + shader เข้าเป็นก้อนควันหนึ่งก้อน
 *
 * **กล่องวางที่ `(cx, cy)` ไม่ใช่ที่กองไฟ** ศูนย์กลางกริดของเอนจินเลื่อนไปทางท้ายลม
 * (ดู GridSpec ใน packages/engine/src/types.ts) วางที่กองไฟแล้วควันจะเหลื่อมทั้งก้อน
 * แบบที่ดูเผินๆ เหมือนถูก
 *
 * **`res` เป็นของ "รอบคำนวณ" ไม่ใช่ของ "ฉาก" — ต้องรับใหม่ทุก `update()`**
 * `res.cx, res.cy` คือศูนย์กลางโดเมนซึ่ง**เลื่อนไปท้ายลมทุกครั้งที่ลมเปลี่ยน** ของเดิมจำ
 * `res` ไว้ตั้งแต่ตอนสร้างฉาก พอผู้ใช้เปลี่ยนทิศลมโดยไม่ออกจากโหมด 3 มิติ กล่องจึงถูกวางด้วย
 * ศูนย์กลางของรอบเก่า ควันเลยลอยห่างจากกองไฟไปได้หลายกิโลเมตร ทั้งที่ชั้นทาบพื้นยังถูก
 * (วัดได้ 3.2 กม. ทั้งสองแกนตอนสลับลมจาก 270° เป็น 180°) และหายเองเมื่อกด 2D→3D
 * เพราะฉากถูกสร้างใหม่ — อาการที่ดูเหมือนบั๊กการวาด แต่ต้นตอคือข้อมูลค้าง
 *
 * **แกน z ของกล่องไม่ได้เริ่มที่ศูนย์** เริ่มที่ `boxZ0 = −dz/2` และสูง `dz·Nz`
 * เพื่อให้ศูนย์กลางเท็กเซลชั้น 0 ตกที่ระดับพื้นพอดี เหตุผลเต็มอยู่ใน volume-field.js
 *
 * สนามถูก normalize ด้วย `vmax` ก่อนอัปเป็น half-float แล้วคูณกลับใน shader
 * half-float เก็บได้ถึง 65504 ก็จริง แต่ความละเอียดที่ปลายบนหยาบมาก
 * การ normalize ให้อยู่ใน [0,1] ใช้ช่วงที่แม่นที่สุดของรูปแบบนี้
 *
 * `depthWrite:false` แต่ `depthTest:true` — ภูเขาที่อยู่**หน้า**กล่องบังด้วย depth buffer
 * ส่วนภูเขาที่อยู่**ใน**กล่องบังด้วยการอ่าน uElev ใน shader ต้องมีทั้งสองทาง
 */
import * as THREE from 'three';
import { buildField, buildLutBytes } from './volume-field.js';
import { volumeVert, volumeFrag } from './volume.glsl.js';

/* LUT เริ่มที่ขอบล่างของแถบแรกใน BANDS ไม่ใช่ 1 — ต่ำกว่าแถบแรกแผนที่ 2D ก็ไม่แสดงสี */
const LUT_HI = 500;

export function createVolume({ res: res0, elevTexture, elevMin = 0, elevMax = 0, bands }) {
  const LUT_LO = bands[0].lo;
  /* ความสูงต่ำสุด/สูงสุดของภูมิประเทศเปลี่ยนได้เมื่อเมชถูกสร้างใหม่ (DEM มาทีหลัง หรือโดเมนเลื่อน)
     จึงต้องเก็บเป็นตัวแปร ไม่ใช่ปิดทับค่าที่รับมาตอนสร้าง — ดู setElevation() ข้างล่าง */
  let elevLo = elevMin, elevHi = elevMax;

  const lut = new THREE.DataTexture(
    buildLutBytes(bands, { lo: LUT_LO, hi: LUT_HI, size: 256 }), 256, 1, THREE.RGBAFormat);
  lut.minFilter = lut.magFilter = THREE.LinearFilter;
  lut.wrapS = lut.wrapT = THREE.ClampToEdgeWrapping;
  lut.needsUpdate = true;

  const uniforms = {
    uBoxSize:   { value: new THREE.Vector3(2 * res0.R, 2 * res0.R, 1) },  // ค่าตั้งต้น ถูกทับทุก update()
    uCamLocal:  { value: new THREE.Vector3() },
    uField:     { value: null },
    uGround:    { value: null },
    uGmax:      { value: 1 },
    uElev:      { value: elevTexture },
    uLut:       { value: lut },
    uVmax:      { value: 1 },
    uK:         { value: 0.02 },
    uElevScale: { value: 1 },
    uBoxZ0:     { value: 0 },
    uAglZ0:     { value: 0 },
    uAglH:      { value: 1 },
    uElevScaleUv:  { value: new THREE.Vector2(1, 1) },
    uElevOffsetUv: { value: new THREE.Vector2(0, 0) },
    uLutLo:     { value: LUT_LO },
    uBg:        { value: 0 },
    uCMin:      { value: 1 },     // µg/m³ ตรงกับ minC ของ volume.js
    uSunDir:    { value: new THREE.Vector3(0, 0, 1) },
    uAmbient:   { value: 0.34 },  // ในเงายังเห็นเฉดสีของแถบ ไม่ดำจนอ่านค่าไม่ได้
    uAlphaCap:  { value: 0.92 },
    uKLight:    { value: 2.2e-5 },
    uLutHi:     { value: LUT_HI },
    uSteps:     { value: 64 },   // ต้องตรงกับค่าตั้งต้นใน scene.js
  };

  /* `side` กับ `depthTest` ถูกสลับทุกเฟรมใน syncCamera ดูเหตุผลเต็มที่นั่น
     ค่าที่ตั้งตรงนี้คือกรณี "กล้องอยู่นอกกล่อง" ซึ่งเป็นกรณีปกติ */
  const mat = new THREE.ShaderMaterial({
    vertexShader: volumeVert, fragmentShader: volumeFrag, uniforms,
    transparent: true, depthWrite: false, depthTest: true,
    side: THREE.FrontSide, glslVersion: THREE.GLSL3,
  });

  const mesh = new THREE.Mesh(new THREE.BoxGeometry(1, 1, 1), mat);
  mesh.renderOrder = 10;
  mesh.frustumCulled = false;     // กล้องเข้าไปอยู่ในกล่องได้ ปล่อยให้ cull แล้วควันจะกะพริบหาย
  mesh.visible = false;

  return {
    mesh,
    update({ res = res0, grid, hour, opts, step, bg = 0, sunDir = null }) {
      if (!grid || !hour) { mesh.visible = false; return; }
      const { cx, cy, R } = res;          // ของรอบนี้เท่านั้น ห้ามใช้ค่าที่จำไว้ตอนสร้างฉาก
      const f = buildField({ grid, res, hour, step, Nz: 48, pexag: opts.pexag });
      if (!(f.vmax > 0)) { mesh.visible = false; return; }

      const norm = new Uint16Array(f.data.length);
      for (let i = 0; i < f.data.length; i++) norm[i] = toHalf(f.data[i] / f.vmax);

      if (uniforms.uField.value) uniforms.uField.value.dispose();
      const tex = new THREE.Data3DTexture(norm, f.Nx, f.Ny, f.Nz);
      tex.format = THREE.RedFormat;
      tex.type = THREE.HalfFloatType;
      tex.minFilter = tex.magFilter = THREE.LinearFilter;
      tex.wrapS = tex.wrapT = tex.wrapR = THREE.ClampToEdgeWrapping;
      tex.needsUpdate = true;
      uniforms.uField.value = tex;

      // แผนที่ค่าที่พื้นสำหรับเลือกสี — ความละเอียดเท่าแนวราบของสนาม 3 มิติพอดี
      if (uniforms.uGround.value) uniforms.uGround.value.dispose();
      const gnorm = new Uint16Array(f.ground.length);
      const gs = f.gmax > 0 ? 1 / f.gmax : 0;
      for (let i = 0; i < f.ground.length; i++) gnorm[i] = toHalf(f.ground[i] * gs);
      const gtex = new THREE.DataTexture(gnorm, f.Nx, f.Ny, THREE.RedFormat, THREE.HalfFloatType);
      gtex.minFilter = gtex.magFilter = THREE.LinearFilter;
      gtex.wrapS = gtex.wrapT = THREE.ClampToEdgeWrapping;
      gtex.needsUpdate = true;
      uniforms.uGround.value = gtex;
      uniforms.uGmax.value = f.gmax;

      /* **กล่องต้องคร่อมทั้งช่วงความสูงของภูเขาบวกความหนาของควัน**
         เพราะควันเลาะไปตามผิวดินซึ่งสูงต่ำไม่เท่ากันทั้งโดเมน กล่องที่สูงแค่ความหนาควัน
         จะครอบได้แค่บริเวณที่พื้นราบเท่ากันหมด — ที่เหลือควันจะโผล่พ้นกล่องหรือจมใต้กล่อง */
      const zBase = elevLo * opts.exag + f.aglZ0;
      const zTopAbs = elevHi * opts.exag + f.aglZ0 + f.aglH;
      const boxHAbs = Math.max(zTopAbs - zBase, f.aglH);

      uniforms.uVmax.value = f.vmax;
      uniforms.uBoxSize.value.set(f.boxW, f.boxD, boxHAbs);
      uniforms.uBoxZ0.value = zBase;
      uniforms.uAglZ0.value = f.aglZ0;
      uniforms.uAglH.value = f.aglH;
      uniforms.uElevScale.value = opts.exag;
      // กล่องเล็กกว่าโดเมน DEM — บอก shader ว่า uv ของกล่องไปตกตรงไหนของโดเมน
      uniforms.uElevScaleUv.value.set(f.boxW / (2 * R), f.boxD / (2 * R));
      uniforms.uElevOffsetUv.value.set(
        (f.boxX - f.boxW / 2 - (cx - R)) / (2 * R),
        (f.boxY - f.boxD / 2 - (cy - R)) / (2 * R));
      uniforms.uBg.value = bg;
      /* กล่องไม่ถูกหมุนและไม่ถูกสเกล ทิศในพิกัดโลกกับพิกัดกล่องจึงเป็นตัวเดียวกัน
         ถ้าวันหลังมีใครหมุนกล่อง ต้องแปลงทิศด้วย ไม่งั้นเงาจะชี้ผิดทางแบบเงียบๆ */
      if (sunDir) uniforms.uSunDir.value.set(sunDir.x, sunDir.y, sunDir.z).normalize();
      /* ความทึบ: ตั้งให้ควัน 50 µg/m³ หนา 500 ม. ได้ราว 30% และแกนกลางหลักร้อยทึบเกือบเต็ม
         ค่าเดิมสูงกว่านี้ร้อยเท่า ทุกอย่างจึงทึบตันหมดจนดูเป็นก้อนพลาสติก ไม่ใช่ควัน */
      uniforms.uK.value = (0.4 + opts.smokeOpacity * 2.0) * 1e-5;

      mesh.geometry.dispose();
      mesh.geometry = new THREE.BoxGeometry(f.boxW, f.boxD, boxHAbs);
      mesh.position.set(f.boxX, f.boxY, zBase + boxHAbs / 2);
      mesh.visible = true;
    },
    setSteps(n) { uniforms.uSteps.value = n; },
    /**
     * รับเมชภูมิประเทศชุดใหม่ — ใช้เมื่อโดเมนเลื่อนหรือ DEM เพิ่งมาถึง แล้ว `terrain` ถูกสร้างใหม่
     * ถ้าไม่เรียก shader จะยังตัดรังสีด้วย texture ความสูงของโดเมนเก่า ควันจะจมภูเขาผิดลูก
     */
    setElevation({ elevTexture: tex, elevMin: lo = 0, elevMax: hi = 0 }) {
      uniforms.uElev.value = tex;
      elevLo = lo; elevHi = hi;
    },
    /**
     * ต้องเรียกทุกเฟรม — shader ทำงานในระบบพิกัดกล่อง จึงต้องรู้ตำแหน่งกล้องในระบบนั้น
     *
     * **และต้องสลับหน้าที่วาดตามว่ากล้องอยู่นอกหรือในกล่อง** นี่คือหัวใจของการบังที่ถูกต้อง
     *
     * ตอนแรกใช้ `BackSide` ตามตัวอย่าง volume rendering ทั่วไป ผลคือ**ไม่เห็นควันเลยสักพิกเซล**
     * เพราะ fragment ที่ได้คือผิว**หลัง**ของกล่องซึ่งอยู่ไกลกว่าภูเขาเกือบทุกจุด
     * depth test จึงตัดทิ้งหมด โดยไม่มี error ให้จับ
     *
     * ใช้ `FrontSide` แล้ว fragment คือผิว**หน้า** ซึ่งใกล้กว่า ทำให้:
     *   · ภูเขาที่อยู่**หน้ากล่อง** บังด้วย depth buffer ของฮาร์ดแวร์ — แม่นและฟรี
     *   · ภูเขาที่อยู่**ในกล่อง** บังด้วยการอ่าน uElev ใน shader
     * ครบทั้งสองกรณีโดยไม่ต้องทำ depth prepass
     *
     * ยกเว้นตอนกล้องมุดเข้าไปในกล่องเอง ซึ่งผิวหน้าถูก cull ทิ้ง ต้องกลับไปใช้ BackSide
     * และปิด depth test เพราะผิวหลังอยู่ไกลกว่าภูเขาอีกครั้ง
     */
    syncCamera(camera) {
      const local = uniforms.uCamLocal.value;
      local.copy(camera.position);
      mesh.worldToLocal(local);
      const h = uniforms.uBoxSize.value;
      const inside = Math.abs(local.x) <= h.x / 2 && Math.abs(local.y) <= h.y / 2
                  && Math.abs(local.z) <= h.z / 2;
      const side = inside ? THREE.BackSide : THREE.FrontSide;
      if (mat.side !== side) { mat.side = side; mat.depthTest = !inside; mat.needsUpdate = true; }
    },
    dispose() {
      if (uniforms.uField.value) uniforms.uField.value.dispose();
      if (uniforms.uGround.value) uniforms.uGround.value.dispose();
      lut.dispose(); mat.dispose(); mesh.geometry.dispose();
    },
  };
}

/* แปลง float32 เป็นบิตของ half-float — three ไม่ได้ export ตัวช่วยนี้ออกมาให้ใช้ */
const _f = new Float32Array(1), _i = new Int32Array(_f.buffer);
function toHalf(v) {
  _f[0] = v;
  const x = _i[0], sign = (x >> 16) & 0x8000;
  const exp = ((x >> 23) & 0xff) - 112, man = x & 0x7fffff;
  if (exp <= 0) return sign;
  if (exp >= 31) return sign | 0x7bff;
  return sign | (exp << 10) | (man >> 13);
}
