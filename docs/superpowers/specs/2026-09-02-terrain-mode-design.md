# ก้าว 5 — โหมดตามภูมิประเทศ (ข้อ 2–4 ของ HANDOFF)

วันที่ 2026-09-02 · branch `terrain/step5` · สเปกต้นทาง `HANDOFF-terrain-mode.md`
ข้อ 1 (บั๊ก σ แช่) แก้แล้วใน `99c573c` · เอกสารนี้คุมข้อ 2–4

## การตัดสินใจของเจ้าของงาน (2026-09-02)

- ของใหม่เขียนเป็น**โมดูลแยก** แตะ `app/src/app.js` น้อยที่สุด — ไม่รอแผน B (แตกชั้น) ก่อน
  แผน B ทีหลังแค่ย้ายของเก่าเข้าโครงที่โมดูลใหม่เริ่มไว้แล้ว
- เกณฑ์ข้อ 1 นิยามใหม่: เทียบ puff กับ Gaussian เฉพาะระยะที่ควันไปถึงในเวลาจำลอง
  (`test/puff-vs-gauss.test.ts`) · ที่ 1/3 กม. ยังไม่ผ่านและเป็นงานแยก

## โมดูลใหม่และรอยต่อ

```
app/src/services/dem.js        ดึง DEM → Float32Array N×N เรียงตรงกับกริดของเอนจิน
app/src/services/dem-math.js   ส่วนบริสุทธิ์ ทดสอบใน node: เลือก zoom · ถอด terrarium ·
                               mercator · bilinear · upsample ของ Open-Meteo
app/src/map2d/terrain.js       hillshade (canvas → L.imageOverlay) + เส้นชั้นความสูง
                               (d3.contours 6–8 ระดับ) ใน pane ของตัวเองใต้ชั้นควัน
packages/engine  (เพิ่มอย่างเดียว) run(P, hooks?) · hooks.onProgress(hourDone, total)
                               worker.ts ส่ง {type:'progress', h, nH, reqId} ก่อนผลสุดท้าย
```

จุดที่แตะ `app.js` (ตั้งใจให้เล็ก): import 2 บรรทัด · `S.model` `S.dem` `S.progress` ·
`runSim()` ใส่ `payload.model` + `payload.elev` และเรียกวาดภูมิประเทศ ·
`onmessage` แยกข้อความ progress · `setModel()` + ปุ่ม `#mGauss/#mPuff` (เลียน `setWxMode`) ·
สถานะ DEM ในแผง

### `services/dem.js`

- `loadDem(origin, grid) → Promise<{ok:true, elev, meta:{source, zoom, tiles, resM, minZ, maxZ, relief}} | {ok:false, reason}>`
- **แหล่งหลัก** AWS terrarium `…/terrarium/{z}/{x}/{y}.png` ถอด `(R·256 + G + B/256) − 32768`
  ต้อง `img.crossOrigin = 'anonymous'` ก่อนวาดลง canvas ไม่งั้น `getImageData` โดนบล็อก
- **เลือก zoom** ให้โดเมนครอบด้วยไทล์ไม่เกิน 3×3 (ไล่จาก z=14 ลงจนพอ) ที่ R=10 กม. ได้ z=12
  ≈ 36 ม./พิกเซล · R=40 กม. ได้ z=10
- **โมเสกครอบ origin ± 1.4R ไม่ขึ้นกับทิศลม** เพราะ `cx,cy` เลื่อนตามลม 0.32R ทุกครั้งที่
  พารามิเตอร์เปลี่ยน ถ้าคีย์ cache ผูกกับ cx,cy จะดึงใหม่ทุกครั้ง → cache โมเสกด้วย
  (origin, R) แล้ว sample ต่อกริดซึ่งถูก
- **แหล่งสำรอง** Open-Meteo elevation 100 จุด/คำขอ · กริด 20×20 = 4 คำขอ · bilinear
  upsample เป็น N×N · CORS ใช้ได้แน่เพราะ provider เดียวกับพยากรณ์
- **fail-safe** ล้มทั้งสองแหล่ง → `{ok:false, reason}` ภาษาไทย แอปรันโหมดพื้นราบต่อ
  พร้อมป้ายบอก ห้ามพังทั้งแอป (สเปก §9 / HANDOFF กติกา)

### `map2d/terrain.js`

- pane ใหม่ `terrainPane` zIndex 350 (ต่ำกว่า overlayPane 400) ทั้ง hillshade และเส้นชั้น
  ความสูงอยู่ในนี้ → ควัน (`rasterL` zIndex 250 ใน overlayPane) และเส้นชั้น**ความเข้มข้น**
  (`gCont`) อยู่บนเสมอ ไม่ต้องยุ่งกับ zIndex ของของเดิม
- hillshade: Horn gradient · แสงจาก 315°/45° · grayscale ทึบต่ำ ให้ basemap ยังอ่านออก
- เส้นชั้นความสูง 6–8 ระดับ สีจาง · แสดงเฉพาะเมื่อ `S.model==='puff'` และ DEM โหลดได้
- ทางเลือกใน HANDOFF (ลูกศรสนามลมที่ถูกเบน) ยังไม่ทำ จดไว้

### UI

- ปุ่ม `พื้นราบ (Gaussian) · เร็ว` / `ตามภูมิประเทศ (Puff) · ช้ากว่า` ข้างปุ่มสภาพอากาศ
- สถานะ DEM: แหล่ง · ความละเอียด ม. · ความต่างระดับ ม. · Froude รายชั่วโมง (`perHour[].Fr`)
- ความคืบหน้า: worker ส่งทุกชั่วโมง แสดง "คำนวณชั่วโมง h/nH…" แทนค้างเงียบ

## ลำดับทำ — แต่ละก้าวได้ของที่ใช้ได้

| ก้าว | ได้อะไร | ตรวจด้วย |
|---|---|---|
| A ✅ | hooks ในเอนจิน + worker ส่ง progress + ปุ่มเลือกโหมด + `payload.model` (ยังไม่มี DEM = puff บนพื้นราบ) | golden เขียวเท่าเดิม · `hooks.test.ts` · smoke กด `#mPuff` แล้วได้ `model:'puff'` |
| B ✅ | `dem-math.js` + เทสต์ node · `dem.js` ดึงจริง + fallback + cache · ต่อเข้า `runSim` · สถานะ DEM | unit บริสุทธิ์ · smoke ที่ route() บล็อก terrarium แล้วแอปยังทำงาน (เกณฑ์ 6) |
| C ✅ | `terrain.js` hillshade + เส้นชั้นความสูงใต้ควัน | เกณฑ์ 4 · ภาพจริงใน Dia |
| D | เผาในแอ่งเชียงใหม่เช้ามืด ควันไม่ปีนดอยสุเทพ (เกณฑ์ 3) · ไทม์ไลน์ลื่นไม่คำนวณใหม่ (เกณฑ์ 5) | เช็คด้วยตา + smoke |
