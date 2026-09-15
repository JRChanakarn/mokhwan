/**
 * scene — renderer กล้อง controls ฟ้า หมอก แสง และห่วงวาด
 *
 * **แกน Z ชี้ขึ้น** ต้องตั้ง `camera.up` เอง เพราะค่าปริยายของ three.js คือ Y ขึ้น
 * เลือก Z ขึ้นเพราะทำให้ `x, y` ในฉากเป็นพิกัดเอนจินตรงๆ ไม่ต้องแปลงที่ไหนเลย
 * และ `PlaneGeometry` กับ `BoxGeometry` วางตัวบนระนาบ XY อยู่แล้ว จึงไม่ต้องหมุนอะไร
 *
 * กล้องเริ่มที่มุมต่ำและใกล้พื้น ด้วยเหตุผลเดียวกับฝั่ง MapLibre (`pitch: 74`)
 * มุมสูงกับซูมออกทำให้ภูเขาดูแบนจนอ่านความชันไม่ออก ซึ่งเป็นเรื่องหลักที่ต้องดูในโหมดนี้
 *
 * ห่วงวาดต้อง `stop()` ตอนสลับกลับ 2D ไม่งั้นกิน GPU ค้างทั้งที่ไม่มีใครดู
 */
import * as THREE from 'three';
import { OrbitControls } from 'three/examples/jsm/controls/OrbitControls.js';
import { skyFor, sunDirection, isDaylight } from '../sky-palette.js';

/**
 * เฟรมช้ากว่านี้ติดกันเท่านี้ ถือว่าเครื่องไม่ไหว แล้วลดคุณภาพลงเอง
 * ตั้งไว้สั้นมากโดยตั้งใจ — รอบแรกที่ลองจริงตั้ง 30 เฟรม แล้วเบราว์เซอร์ค้างก่อนจะครบ
 * ตัวนับจึงไม่เคยได้ทำงาน สัญญาณเตือนต้องมาถึงก่อนที่หน้าจะหยุดตอบสนอง
 */
const SLOW_MS = 45, SLOW_STREAK = 4;

export function createScene(container, { origin, hourKey, spanM }) {
  const renderer = new THREE.WebGLRenderer({ antialias: true, powerPreference: 'high-performance' });
  if (!renderer.capabilities.isWebGL2) {
    renderer.dispose();
    throw new Error('การ์ดจอไม่รองรับ WebGL2 ซึ่งจำเป็นกับการวาดควันแบบใหม่ — กดปุ่ม "แบบเดิม" เพื่อใช้ตัวสำรอง');
  }
  /* **pixelRatio 1 เสมอ ไม่ตาม devicePixelRatio** — ตั้งใจ ไม่ใช่ลืม
     ต้นทุนของ raymarch เป็นสัดส่วนตรงกับจำนวนพิกเซลจริง บนจอ retina ที่ ratio 2
     canvas กลายเป็น 2326×1744 ≈ 4 ล้านพิกเซล คูณจำนวนก้าวแล้วได้หลายร้อยล้าน
     ครั้งที่ต้องสุ่ม texture ต่อเฟรม ซึ่งทำให้เบราว์เซอร์ค้างสนิทตั้งแต่เฟรมแรกตอนลองจริง
     ภาพจะนุ่มกว่าเดิมนิดหน่อย แลกกับการที่มันหมุนได้ */
  renderer.setPixelRatio(1);
  renderer.setSize(container.clientWidth || 1, container.clientHeight || 1);
  renderer.outputColorSpace = THREE.SRGBColorSpace;
  container.appendChild(renderer.domElement);

  const scene = new THREE.Scene();
  const camera = new THREE.PerspectiveCamera(55, 1, 10, spanM * 8);
  camera.up.set(0, 0, 1);
  camera.position.set(0, -spanM * 0.9, spanM * 0.28);   // ยืนใต้ลมมองขึ้นเหนือ มุมต่ำ

  const controls = new OrbitControls(camera, renderer.domElement);
  controls.enableDamping = true;
  controls.maxPolarAngle = Math.PI * 0.495;             // กันกล้องมุดลงใต้พื้น
  controls.target.set(0, 0, 0);

  const sun = new THREE.DirectionalLight(0xfff4e0, 1.45);
  const ambient = new THREE.AmbientLight(0x8fa6c4, 0.6);
  scene.add(sun, ambient);

  function setHour(key) {
    const p = skyFor(key);
    scene.background = new THREE.Color(p.sky);
    /* 1.1/spanM ที่ลองครั้งแรกให้หมอก 70% ที่ระยะ 20 กม. จนภูมิประเทศขาวโพลน
       อ่านความชันไม่ออกเลย ซึ่งเป็นเรื่องหลักที่ต้องดูในโหมดนี้ · 0.45 ให้ราว 18% กำลังดี */
    scene.fog = new THREE.FogExp2(new THREE.Color(p.fog), 0.45 / spanM);
    const d = sunDirection(key, origin.lat);
    const day = isDaylight(key);
    // ดวงอาทิตย์ใต้ขอบฟ้า → ยกขึ้นนิดและหรี่ลง ไม่งั้นภูเขาดำสนิทจนอ่านรูปทรงไม่ออกเลย
    const up = day ? d.z : 0.25;
    sun.position.set(d.x * spanM, d.y * spanM, Math.max(up, 0.12) * spanM);
    sun.intensity = day ? 1.45 : 0.35;
    ambient.intensity = day ? 0.6 : 0.4;
  }
  setHour(hourKey);

  const frameHooks = [];
  const quality = { pixelRatio: renderer.getPixelRatio(), steps: 64, reduced: false };
  let onDegrade = null, slow = 0, last = 0, raf = 0, running = false;

  function frame(now) {
    if (!running) return;
    if (last && !quality.reduced) {
      slow = (now - last) > SLOW_MS ? slow + 1 : 0;
      if (slow >= SLOW_STREAK) {
        // ลดเองก่อนที่ผู้ใช้จะคิดว่าแอปค้าง — raymarch หนักกว่าที่คาดบนเครื่องเก่า
        quality.reduced = true; quality.steps = 32;
        if (onDegrade) onDegrade(quality);
      }
    }
    last = now;
    controls.update();
    for (const f of frameHooks) f();
    renderer.render(scene, camera);
    raf = requestAnimationFrame(frame);
  }

  return {
    scene, camera, renderer, controls, quality,
    add: o => scene.add(o),
    remove: o => scene.remove(o),
    onFrame: fn => { frameHooks.push(fn); },
    onQualityDrop: fn => { onDegrade = fn; },
    setHour,
    resize() {
      const w = container.clientWidth || 1, h = container.clientHeight || 1;
      renderer.setSize(w, h);
      camera.aspect = w / h;
      camera.updateProjectionMatrix();
    },
    /**
     * วาดหนึ่งเฟรมเดี๋ยวนี้ โดยทำครบทุกขั้นเหมือนในห่วงวาดจริง
     *
     * จำเป็นเพราะ `requestAnimationFrame` ไม่ยิงเลยเมื่อแท็บไม่ได้อยู่หน้าจอ
     * การเรียก `renderer.render()` ตรงๆ จะข้าม frame hook ที่ sync ตำแหน่งกล้อง
     * เข้า shader ของควัน แล้วได้ภาพที่คิดรังสีจากกล้องตำแหน่งเก่า
     */
    renderNow() {
      controls.update();
      for (const f of frameHooks) f();
      renderer.render(scene, camera);
    },
    start() { if (!running) { running = true; last = 0; raf = requestAnimationFrame(frame); } },
    stop() { running = false; cancelAnimationFrame(raf); },
    dispose() {
      running = false; cancelAnimationFrame(raf);
      controls.dispose(); renderer.dispose();
      const el = renderer.domElement;
      if (el.parentNode) el.parentNode.removeChild(el);
    },
  };
}
