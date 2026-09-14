/**
 * shader ของก้อนควัน — เดินรังสีผ่านสนาม 3 มิติแล้วสะสมสีจากหน้าไปหลัง
 *
 * **ทำไมต้อง raymarch ไม่ใช่กล่องทึบ** กล่องของ fill-extrusion บังภูเขาเสมอเพราะเป็นทรงตัน
 * ทั้งที่คำถามหลักของทั้งโปรเจกต์คือ "ภูเขาเบนลมหรือลมข้ามไป" การเดินรังสีทำให้
 * หยุดที่ผิวดินได้จริง และค่าที่เห็นคือผลรวมตามทางเดินของแสง ซึ่งตรงกับความหมายของควัน
 *
 * **ตัดด้วยผิวดินโดยตรง ไม่ทำ depth prepass** เรามี DEM เป็น texture อยู่แล้ว
 * และภูมิประเทศเป็น heightfield ไม่มีอะไรยื่นเกิน การเทียบ `z < elev(x,y)` จึงถูกต้องพอดี
 * และประหยัดกว่าการตั้ง render target พร้อม depth texture ทั้งชุดมาก
 *
 * ต้องคอมไพล์เป็น GLSL3 (`glslVersion: THREE.GLSL3`) เพราะ `sampler3D` กับ `texture()`
 * ไม่มีใน GLSL1 ถ้าลืมจะได้จอดำพร้อม error คอมไพล์ใน console
 */

export const volumeVert = /* glsl */`
out vec3 vLocal;
void main() {
  vLocal = position;                       // พิกัดในระบบของกล่อง จุดกำเนิดอยู่กลางกล่อง
  gl_Position = projectionMatrix * modelViewMatrix * vec4(position, 1.0);
}`;

export const volumeFrag = /* glsl */`
precision highp float;
precision highp sampler3D;

in vec3 vLocal;
out vec4 fragColor;

uniform vec3  uBoxSize;      // (2R, 2R, boxH)
uniform vec3  uCamLocal;     // ตำแหน่งกล้องในระบบพิกัดกล่อง
uniform sampler3D uField;    // ความหนาแน่นสำหรับคุมความทึบ
uniform sampler2D uGround;   // ค่าที่พื้นของคอลัมน์ สำหรับเลือก**สี** (ดู volume-field.js)
uniform float     uGmax;
uniform sampler2D uElev;
uniform sampler2D uLut;
uniform float uVmax;         // ค่าสูงสุดของสนาม ใช้ถอดค่ากลับจาก texture ที่ normalize แล้ว
uniform float uK;            // สัมประสิทธิ์ความทึบ ผูกกับสไลเดอร์ความทึบควัน
uniform float uElevScale;    // ตัวคูณยกภูมิประเทศ ต้องตรงกับที่เมชใช้ ไม่งั้นควันลอยผิดชั้น
uniform float uBoxZ0;        // ฐานกล่องเหนือระดับน้ำทะเล
uniform float uAglZ0;        // ฐานของ**สนามควัน** เหนือ**พื้นดิน** (ดู volume-field.js)
uniform float uAglH;         // ความหนาของสนามควันเหนือพื้นดิน
uniform vec2  uElevScaleUv;  // แปลง uv ของกล่อง → uv ของโดเมน DEM (กล่องเล็กกว่าโดเมน)
uniform vec2  uElevOffsetUv;
uniform float uLutLo;        // ขอบล่างของแถบแรก — ต่ำกว่านี้ไม่วาด เหมือนแผนที่ 2D
uniform float uLutHi;
uniform float uBg;           // ค่าพื้นหลัง ใช้ตอน**ลงสี**เท่านั้น ไม่ใช่ตอนกรอง
uniform float uCMin;         // ค่าควันต่ำสุดที่ยังวาด — ตรงกับ minC ของ volume.js
uniform vec3  uSunDir;       // ทิศ**ไปหา**ดวงอาทิตย์ หน่วยเดียว (กล่องไม่หมุนไม่สเกล จึงใช้พิกัดโลกได้เลย)
uniform float uAmbient;      // แสงพื้นฐานตอนอยู่ในเงา กัน 0 = ดำสนิท
uniform float uAlphaCap;     // เพดานความทึบ ให้ยังมองทะลุแกนเห็นโครงสร้างได้
uniform float uKLight;       // สัมประสิทธิ์การบังแสง — แยกจาก uK เพื่อจูนความคมของเงาได้อิสระ
uniform int   uSteps;

/* สุ่มจากพิกัดจอ — จุดเริ่มรังสีที่ไม่สุ่มจะทำให้เห็นวงแหวนซ้อนเป็นชั้นชัดมาก
   เพราะทุกพิกเซลเริ่มเดินที่ระยะเดียวกันเป๊ะ แล้วขอบของแต่ละก้าวเรียงตัวกันเป็นวง */
float hash(vec2 p) { return fract(sin(dot(p, vec2(12.9898, 78.233))) * 43758.5453); }

/* ตัดกล่องด้วยวิธี slab คืนช่วง t ที่รังสีอยู่ในกล่อง */
vec2 boxRange(vec3 o, vec3 d, vec3 halfSize) {
  vec3 inv = 1.0 / d;
  vec3 a = (-halfSize - o) * inv, b = (halfSize - o) * inv;
  vec3 lo = min(a, b), hi = max(a, b);
  return vec2(max(max(lo.x, lo.y), lo.z), min(min(hi.x, hi.y), hi.z));
}

/* สุ่มความเข้มข้นควัน (ไม่รวมพื้นหลัง) ที่จุดในระบบพิกัดกล่อง — คืน 0 ถ้าอยู่นอกก้อน */
float sampleSmoke(vec3 p, vec3 halfSize, float ground) {
  vec3 uvw = (p + halfSize) / uBoxSize;
  if (any(lessThan(uvw, vec3(0.0))) || any(greaterThan(uvw, vec3(1.0)))) return 0.0;
  float agl = (uBoxZ0 + uvw.z * uBoxSize.z) - ground;
  float wTex = (agl - uAglZ0) / uAglH;
  if (wTex < 0.0 || wTex > 1.0) return 0.0;
  return texture(uField, vec3(uvw.xy, wTex)).r * uVmax;
}

/**
 * สัดส่วนแสงที่เหลือหลังทะลุควันมาถึงจุดนี้
 *
 * **นี่คือสิ่งเดียวที่ทำให้ควันดูเป็นควัน** ก่อนหน้านี้ raymarch สะสมแต่สี ไม่มีแสงเลย
 * แกนที่เข้มข้นจึงออกมาเป็นแผ่นสีม่วงแบนเหมือนพลาสติก ควันจริงได้รูปทรงจากการที่
 * ด้านรับแสงสว่างกว่าด้านใน เพราะแสงถูกควันชั้นนอกบังไว้
 *
 * ใช้ “ground” ของจุดตั้งต้นตลอดการเดิน ไม่สุ่มความสูงพื้นใหม่ทุกก้าว — ระยะเดินสั้น
 * เมื่อเทียบกับความกว้างของภูมิประเทศ ความคลาดเคลื่อนมองไม่ออก แต่ประหยัดการสุ่มไปครึ่งหนึ่ง
 */
float lightTransmittance(vec3 p, vec3 halfSize, float ground, float stepLen) {
  float tau = 0.0;
  for (int j = 0; j < 4; j++) {
    tau += sampleSmoke(p + uSunDir * (stepLen * (float(j) + 0.5)), halfSize, ground) * stepLen;
  }
  return exp(-uKLight * tau);
}

void main() {
  vec3 halfSize = uBoxSize * 0.5;
  vec3 ro = uCamLocal;
  vec3 rd = normalize(vLocal - uCamLocal);

  vec2 tr = boxRange(ro, rd, halfSize);
  float t0 = max(tr.x, 0.0), t1 = tr.y;
  if (t1 <= t0) discard;

  float steps = float(uSteps);
  float dt = (t1 - t0) / steps;
  float t = t0 + dt * hash(gl_FragCoord.xy);      // jitter กันแถบวงแหวน

  vec4 acc = vec4(0.0);
  for (int i = 0; i < 256; i++) {
    if (float(i) >= steps || acc.a > 0.98) break;

    vec3 p = ro + rd * t;
    vec3 uvw = (p + halfSize) / uBoxSize;

    /* กล่องเล็กกว่าโดเมน DEM จึงต้องแปลง uv ก่อน
       และต้องกลับแกน v เพราะแถวที่ 0 ของ elevTexture คือ j=0 ซึ่งอยู่ **เหนือสุด**
       ส่วน uvw.y = 0 ของกล่องคือด้าน **ใต้สุด** ลืมกลับแล้วภูเขาจะบังควันสลับทิศเหนือ-ใต้ */
    vec2 duv = uElevOffsetUv + uvw.xy * uElevScaleUv;
    float ground = texture(uElev, vec2(duv.x, 1.0 - duv.y)).r * uElevScale;

    /* **กล่องอยู่ในระบบเหนือระดับน้ำทะเล แต่สนามควันอยู่ในระบบเหนือพื้นดิน**
       ต้องลบความสูงพื้นออกก่อนเสมอ ไม่งั้นควันจะจมอยู่ใต้ภูเขาทั้งก้อนแล้วจอว่างเปล่า
       โดยไม่มี error ให้จับ — เคยพลาดมาแล้ว ดูหมายเหตุใน volume-field.js */
    float worldZ = uBoxZ0 + uvw.z * uBoxSize.z;
    float agl = worldZ - ground;
    if (agl < 0.0) break;                       // จมใต้ผิวดิน นี่คือจุดที่ภูเขาบังควันได้จริง

    float wTex = (agl - uAglZ0) / uAglH;
    if (wTex < 0.0 || wTex > 1.0) { t += dt; continue; }   // เหนือก้อนควัน ยังไม่จบรังสี

    /* **กรองด้วยควันล้วน แต่ลงสีด้วยค่ารวมพื้นหลัง** — เหมือน volume.js เดิมเป๊ะ
       (กรองด้วย minC ก่อน แล้วค่อยเลือกแถบสีจาก c + bg)
       ลองบวกพื้นหลังก่อนกรองแล้วได้สี่เหลี่ยมฟ้าคลุมทั้งกล่อง เพราะพื้นหลัง 25
       สูงกว่าขอบแถบแรก 15 อยู่แล้ว ทุกจุดในกล่องจึงผ่านเกณฑ์แม้ไม่มีควันสักหยด
       ความทึบก็ต้องมาจากควันล้วน — หมอกพื้นหลังไม่ใช่ควันจากกองไฟนี้ */
    float craw = texture(uField, vec3(uvw.xy, wTex)).r * uVmax;
    if (craw > uCMin) {
      /* **สีมาจากค่าที่พื้นของคอลัมน์ ไม่ใช่ความหนาแน่นตรงจุดที่รังสีอยู่**
         คนหายใจที่พื้น แถบสีจึงต้องบอกสิ่งที่คนตรงนั้นเจอจริง และต้องตรงกับแผนที่ 2D
         ถ้าลงสีตามความหนาแน่นในอากาศ คอลัมน์ที่พื้นอยู่แถบส้มจะถูกวาดม่วงตอนมองผ่านแกน */
      float cg = texture(uGround, uvw.xy).r * uGmax + uBg;
      float u = clamp(log(max(cg, uLutLo) / uLutLo) / log(uLutHi / uLutLo), 0.0, 1.0);
      vec3 col = texture(uLut, vec2(u, 0.5)).rgb;

      /* **เฉดสี (hue) ยังมาจากแถบ AQI เหมือนเดิม เปลี่ยนแค่ความสว่าง**
         เจ้าของงานอนุมัติข้อแลกนี้แล้ว — ถ้าคุมความสว่างไว้คงที่ด้วย แกนควันจะกลับไป
         แบนเหมือนเดิม เพราะทุกค่าที่เกิน 350 ได้สีม่วงเดียวกันหมด */
      float shade = uAmbient + (1.0 - uAmbient)
                  * lightTransmittance(p, halfSize, ground, uAglH * 0.35);

      /* กระเจิงไปข้างหน้า — มองย้อนแสงแล้วควันสว่างวาบ เป็นลักษณะเด่นที่ตาจับได้ทันที
         ว่าเป็นละอองลอย ไม่ใช่ของแข็ง */
      float phase = 0.75 + 0.55 * pow(max(dot(rd, uSunDir), 0.0), 4.0);

      float a = 1.0 - exp(-uK * craw * dt);       // Beer-Lambert จากควันล้วน
      acc.rgb += (1.0 - acc.a) * col * (shade * phase) * a;
      acc.a   += (1.0 - acc.a) * a;
    }
    t += dt;
  }

  if (acc.a <= 0.002) discard;
  /* เพดานความทึบ — ปล่อยให้ทึบ 100% แล้วแกนควันกลายเป็นสติกเกอร์แปะทับภูเขา
     เหลือช่องให้เห็นพื้นหลังจางๆ ตาจึงอ่านว่าเป็นก้อนอากาศ ไม่ใช่วัตถุแข็ง */
  fragColor = vec4(acc.rgb / max(acc.a, 1e-4), min(acc.a, uAlphaCap));
}`;
