/* ภาษาของหน้า: ไทยเป็นค่าปริยาย อังกฤษเมื่อลิงก์ขอ (?lang=en) หรือผู้ใช้เคยเลือกไว้
   ข้อความในโค้ดอยู่ข้างจุดที่ใช้เป็นคู่ tr("English", "ไทย") แบบเดียวกับ Masu
   ส่วนข้อความคงที่ใน index.html แปลด้วยพจนานุกรม (i18n-html.js) ตอนบูต จึงไม่ต้องแตะ markup
   สลับภาษาแล้วโหลดหน้าใหม่ ภาษาจึงไม่เปลี่ยนใต้มือระหว่างที่หน้ากำลังวาด */

const KEY = 'mokhwan-lang';
const isLang = v => v === 'en' || v === 'th';

/** `?lang=` ในลิงก์ชนะ ตามด้วยที่เคยเลือกไว้ แล้วจึงไทย */
export function resolveLang(search, stored){
  const asked = new URLSearchParams(search).get('lang');
  if(isLang(asked)) return asked;
  return isLang(stored) ? stored : 'th';
}

function stored(){ try{ return localStorage.getItem(KEY); }catch(e){ return null; } }
function remember(v){ try{ localStorage.setItem(KEY, v); return true; }catch(e){ return false; } }

export const lang = typeof window === 'undefined' ? 'th' : resolveLang(location.search, stored());
if(typeof window !== 'undefined'){
  if(isLang(new URLSearchParams(location.search).get('lang'))) remember(lang);
  document.documentElement.lang = lang;
}

/** ข้อความตามภาษาปัจจุบัน */
export const tr = (en, th) => lang === 'en' ? en : th;

/** สลับภาษาแล้วโหลดหน้าใหม่ — ไม่มีที่เก็บก็ให้ภาษาติดไปกับลิงก์แทน */
export function setLang(next){
  const url = new URL(location.href);
  if(remember(next)) url.searchParams.delete('lang');
  else url.searchParams.set('lang', next);
  location.replace(url.toString());
}

const norm = s => s.replace(/\s+/g, ' ').trim();
const ATTRS = ['placeholder', 'title', 'aria-label'];

/** แปลข้อความคงที่ใน DOM ด้วยพจนานุกรม {ไทย: อังกฤษ} — เทียบแบบยุบช่องว่าง เก็บช่องว่างหัวท้ายไว้ */
export function translateDom(root, dict){
  const walker = document.createTreeWalker(root, NodeFilter.SHOW_TEXT, {
    acceptNode: n => /SCRIPT|STYLE/.test(n.parentNode.nodeName) ? NodeFilter.FILTER_REJECT : NodeFilter.FILTER_ACCEPT,
  });
  for(let n = walker.nextNode(); n; n = walker.nextNode()){
    const en = dict[norm(n.nodeValue)];
    if(en != null) n.nodeValue = n.nodeValue.match(/^\s*/)[0] + en + n.nodeValue.match(/\s*$/)[0];
  }
  root.querySelectorAll(ATTRS.map(a => '[' + a + ']').join(',')).forEach(el => {
    for(const a of ATTRS){
      const v = el.getAttribute(a);
      if(v && dict[norm(v)] != null) el.setAttribute(a, dict[norm(v)]);
    }
  });
}
