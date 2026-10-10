'use strict';
/* =========================================================================
   OFFICINA DOCUMENTI — motore di elaborazione (100% locale)
   Librerie incluse: pdf-lib (@cantoo, con cifratura AES), pdf.js (Mozilla), JSZip
   ========================================================================= */
const Core = (() => {
const L = window.PDFLib;
const { PDFDocument, PDFName, PDFRawStream, PDFDict, PDFArray, PDFNumber, PDFRef, PDFBool, StandardFonts, rgb, degrees } = L;
const N = (s) => PDFName.of(s);
// Configurazione: il PC usa i valori predefiniti, la versione mobile imposta window.OFFICINA_CONFIG
const CFG = Object.assign({ maxCanvas: 36e6, pdfjsLib: null, pdfjsWorker: null }, window.OFFICINA_CONFIG || {});

/* ---------- utilità ---------- */
const fmt = (n) => n < 1024 ? n + ' B' : n < 1048576 ? (n / 1024).toFixed(1).replace('.', ',') + ' KB' : (n / 1048576).toFixed(2).replace('.', ',') + ' MB';
const ext = (name) => ((name.match(/\.([^.]+)$/) || [])[1] || '').toLowerCase();
const base = (name) => name.replace(/\.[^.]+$/, '');
const kind = (file) => {
  const e = ext(file.name), t = file.type || '';
  if (e === 'pdf' || t === 'application/pdf') return 'pdf';
  if (['heic', 'heif'].includes(e) || /heic|heif/.test(t)) return 'heic';
  if (['jpg', 'jpeg', 'jfif', 'png', 'webp', 'gif', 'bmp', 'avif'].includes(e) || /^image\/(jpeg|png|webp|gif|bmp|avif)/.test(t)) return 'image';
  if (['docx', 'xlsx', 'pptx', 'docm', 'xlsm', 'pptm', 'odt', 'ods', 'odp'].includes(e)) return 'office';
  if (e === 'zip' || t === 'application/zip') return 'zip';
  return 'other';
};
const bytesOf = async (f) => f instanceof Uint8Array ? f : new Uint8Array(await f.arrayBuffer());
const tick = () => new Promise((r) => setTimeout(r, 0));
const latin1 = (u8) => new TextDecoder('latin1').decode(u8);
const pdfBlob = (u8) => new Blob([u8], { type: 'application/pdf' });

/* ---------- pdf.js (caricato dalla pagina stessa, nessuna rete) ---------- */
let _pdfjs = null;
async function pdfjs() {
  if (_pdfjs) return _pdfjs;
  if (CFG.pdfjsLib) {
    // versione pubblicata: motore in un thread separato (interfaccia sempre reattiva)
    const lib = await import(new URL(CFG.pdfjsLib, location.href).href);
    lib.GlobalWorkerOptions.workerSrc = new URL(CFG.pdfjsWorker, location.href).href;
    _pdfjs = lib; return lib;
  }
  const mk = (id) => URL.createObjectURL(new Blob([document.getElementById(id).textContent], { type: 'text/javascript' }));
  const lib = await import(mk('lib-pdfjs'));
  // Da file locale i Worker sono bloccati dal browser: il motore gira nella pagina stessa.
  globalThis.pdfjsWorker = await import(mk('lib-pdfjs-worker'));
  _pdfjs = lib;
  return lib;
}
async function openPdfJs(bytes, name) {
  const lib = await pdfjs();
  const pw = passwords.get(keyOf(bytes, name));
  const task = lib.getDocument({ data: bytes.slice(), password: pw, isEvalSupported: false, useSystemFonts: true, verbosity: 0 });
  task.onPassword = async (update, reason) => {
    const p = await askPassword(name, reason === 2);
    if (p === null) { task.destroy(); return; }
    passwords.set(keyOf(bytes, name), p);
    update(p);
  };
  try { return await task.promise; }
  catch (e) {
    if (e && (e.name === 'PasswordException' || /password/i.test(e.message || ''))) throw new Error('Operazione annullata: serve la password di «' + name + '».');
    if (e && (e.name === 'InvalidPDFException' || /invalid pdf/i.test(e.message || ''))) throw new Error('«' + name + '» non è un PDF valido oppure è danneggiato.');
    throw e;
  }
}
async function openPdfJsQuiet(bytes) { // per miniature e anteprime: non chiede password, restituisce null
  const lib = await pdfjs();
  const task = lib.getDocument({ data: bytes.slice(), isEvalSupported: false, useSystemFonts: true, verbosity: 0 });
  task.onPassword = () => { task.destroy(); };
  try { return await task.promise; } catch (e) { return null; }
}
async function renderPage(pdf, num, scale, white = true) {
  const page = await pdf.getPage(num);
  let vp = page.getViewport({ scale });
  const MAXPX = CFG.maxCanvas; // limite di sicurezza memoria (più basso su iPhone)
  if (vp.width * vp.height > MAXPX) { scale *= Math.sqrt(MAXPX / (vp.width * vp.height)); vp = page.getViewport({ scale }); }
  const c = document.createElement('canvas');
  c.width = Math.max(1, Math.round(vp.width)); c.height = Math.max(1, Math.round(vp.height));
  const g = c.getContext('2d');
  if (white) { g.fillStyle = '#fff'; g.fillRect(0, 0, c.width, c.height); }
  await page.render({ canvasContext: g, viewport: vp }).promise;
  const base1 = page.getViewport({ scale: 1 });
  page.cleanup();
  return { canvas: c, width: base1.width, height: base1.height };
}

/* ---------- password ---------- */
const passwords = new Map();
const keyOf = (bytes, name) => name + '|' + bytes.length;
let askPassword = async () => null; // sostituita dall'interfaccia
async function loadPdf(bytes, name) {
  const key = keyOf(bytes, name);
  let doc;
  try { doc = await PDFDocument.load(bytes, { ignoreEncryption: true, updateMetadata: false }); }
  catch (e) { throw new Error('«' + name + '» non è un PDF valido oppure è danneggiato.'); }
  if (!doc.isEncrypted) return { doc, encrypted: false };
  const tryPw = async (pw) => { try { return await PDFDocument.load(bytes, { password: pw, updateMetadata: false }); } catch (e) { return null; } };
  const known = passwords.get(key);
  for (const pw of [known, ''].filter((x) => x !== undefined)) {
    const d = await tryPw(pw);
    if (d) { passwords.set(key, pw); cleanEncrypt(d); return { doc: d, encrypted: true }; }
  }
  let wrong = false;
  for (;;) {
    const pw = await askPassword(name, wrong);
    if (pw === null) throw new Error('Operazione annullata: serve la password di «' + name + '».');
    const d = await tryPw(pw);
    if (d) { passwords.set(key, pw); cleanEncrypt(d); return { doc: d, encrypted: true }; }
    wrong = true;
  }
}
function cleanEncrypt(doc) { // elimina il vecchio dizionario di cifratura rimasto orfano
  for (const [ref, o] of doc.context.enumerateIndirectObjects()) {
    if (o instanceof PDFDict && o.get(N('Filter')) === N('Standard') && o.has(N('U')) && o.has(N('O'))) doc.context.delete(ref);
  }
}
function collectGarbage(doc) {
  // pdf-lib riscrive anche gli oggetti non più usati (vecchi metadati, immagini sostituite):
  // tengo solo ciò che è raggiungibile dal documento, così nulla di "cancellato" resta nel file
  const ctx = doc.context; const seen = new Set(); const stack = [];
  const visit = (o) => {
    if (!o) return;
    if (o instanceof PDFRef) { const k = o.toString(); if (seen.has(k)) return; seen.add(k); stack.push(ctx.lookup(o)); return; }
    stack.push(o);
  };
  const ti = ctx.trailerInfo; visit(ti.Root); visit(ti.Info); visit(ti.Encrypt);
  while (stack.length) {
    const o = stack.pop(); if (!o) continue;
    if (o instanceof PDFDict) { for (const [, v] of o.entries()) visit(v); }
    else if (o instanceof PDFArray) { for (const v of o.asArray()) visit(v); }
    else if (o.dict instanceof PDFDict) { for (const [, v] of o.dict.entries()) visit(v); }
  }
  let removed = 0;
  for (const [ref] of ctx.enumerateIndirectObjects()) if (!seen.has(ref.toString())) { ctx.delete(ref); removed++; }
  return removed;
}
const save = async (doc) => { await doc.flush(); collectGarbage(doc); return doc.save({ useObjectStreams: true, updateFieldAppearances: false }); };

/* ---------- analisi PDF ---------- */
function hasSignature(bytes, doc) {
  const s = latin1(bytes);
  if (/\/ByteRange\s*\[/.test(s) || /\/Type\s*\/Sig\b/.test(s)) return true;
  try {
    const af = doc && doc.catalog.lookup(N('AcroForm'));
    const fl = af && af.lookup(N('SigFlags'));
    if (fl && (fl.asNumber() & 1)) return true;
  } catch (e) {}
  return false;
}
function pdfInfo(doc) {
  const out = {};
  try {
    const info = doc.getInfoDict();
    for (const [k, v] of info.entries()) {
      let val = v;
      try { val = v.decodeText ? v.decodeText() : v.toString(); } catch (e) { val = v.toString(); }
      out[k.toString().slice(1)] = String(val);
    }
  } catch (e) {}
  if (doc.catalog.has(N('Metadata'))) out['XMP'] = 'presente (blocco metadati esteso)';
  return out;
}
function stripPdfMetadata(doc) {
  try {
    const info = doc.getInfoDict();
    for (const k of [...info.keys()]) info.delete(k);
  } catch (e) {}
  doc.catalog.delete(N('Metadata'));
  doc.catalog.delete(N('PieceInfo'));
  for (const p of doc.getPages()) { p.node.delete(N('Metadata')); p.node.delete(N('PieceInfo')); }
}

/* ---------- JPEG / EXIF ---------- */
function jpegSegments(b) {
  const segs = [];
  if (b[0] !== 0xFF || b[1] !== 0xD8) return null;
  let i = 2;
  while (i < b.length - 1) {
    if (b[i] !== 0xFF) return segs; // flusso non standard
    const m = b[i + 1];
    if (m === 0xFF) { i++; continue; }
    if (m === 0xD9) { segs.push({ m, start: i, end: i + 2 }); break; }
    if (m >= 0xD0 && m <= 0xD7 || m === 0x01) { i += 2; continue; }
    const len = (b[i + 2] << 8) | b[i + 3];
    const seg = { m, start: i, end: i + 2 + len, data: i + 4 };
    segs.push(seg);
    if (m === 0xDA) { seg.end = b.length; break; }
    i = seg.end;
  }
  return segs;
}
function parseExif(b, off, len) { // off = inizio header TIFF
  const r = { orientation: 1, gps: false, fields: {} };
  const le = b[off] === 0x49;
  const u16 = (p) => le ? b[p] | (b[p + 1] << 8) : (b[p] << 8) | b[p + 1];
  const u32 = (p) => le ? (b[p] | (b[p + 1] << 8) | (b[p + 2] << 16) | (b[p + 3] << 24)) >>> 0 : ((b[p] << 24) | (b[p + 1] << 16) | (b[p + 2] << 8) | b[p + 3]) >>> 0;
  const end = off + len;
  const str = (p, n) => { let s = ''; for (let k = 0; k < n && p + k < end; k++) { const c = b[p + k]; if (!c) break; s += String.fromCharCode(c); } return s.trim(); };
  const names = { 0x010F: 'Produttore fotocamera', 0x0110: 'Modello', 0x0131: 'Software', 0x0132: 'Data', 0x013B: 'Autore', 0x8298: 'Copyright', 0x9003: 'Data scatto', 0xA430: 'Proprietario', 0xA431: 'N. serie fotocamera', 0xA434: 'Obiettivo' };
  const readIfd = (p, depth) => {
    if (p + 2 > end || depth > 3) return;
    const n = u16(p);
    for (let k = 0; k < n; k++) {
      const e = p + 2 + k * 12; if (e + 12 > end) return;
      const tag = u16(e), type = u16(e + 2), cnt = u32(e + 4), vo = e + 8;
      if (tag === 0x0112) r.orientation = u16(vo);
      else if (tag === 0x8825) { r.gps = true; r.fields['Posizione GPS'] = 'presente'; }
      else if (tag === 0x8769) readIfd(off + u32(vo), depth + 1);
      else if (names[tag] && type === 2) { const vp = cnt > 4 ? off + u32(vo) : vo; const s = str(vp, cnt); if (s) r.fields[names[tag]] = s; }
    }
  };
  try { readIfd(off + u32(off + 4), 0); } catch (e) {}
  return r;
}
function jpegMeta(b) {
  const segs = jpegSegments(b); const res = { orientation: 1, gps: false, fields: {}, xmp: false, iptc: false, comment: false };
  if (!segs) return res;
  for (const s of segs) {
    if (s.m === 0xE1) {
      const h = latin1(b.subarray(s.data, Math.min(s.data + 40, s.end)));
      if (h.startsWith('Exif\0')) { const e = parseExif(b, s.data + 6, s.end - s.data - 6); Object.assign(res, { orientation: e.orientation, gps: e.gps }); Object.assign(res.fields, e.fields); res.exif = true; }
      else if (h.startsWith('http://ns.adobe.com')) res.xmp = true;
    } else if (s.m === 0xED) res.iptc = true;
    else if (s.m === 0xFE) res.comment = true;
  }
  return res;
}
const jpegOrientation = (b) => { try { return jpegMeta(b).orientation || 1; } catch (e) { return 1; } };
function jpegStrip(b, keepOrientation) {
  // Rimozione SENZA ricompressione: tolgo EXIF/XMP/IPTC/commenti, tengo profilo colore (APP2) e Adobe (APP14)
  const segs = jpegSegments(b); if (!segs) return b;
  const o = keepOrientation || 1;
  const parts = [b.subarray(0, 2)];
  let inserted = false;
  const exifMin = () => {
    const t = new Uint8Array([0x45, 0x78, 0x69, 0x66, 0, 0, 0x49, 0x49, 0x2A, 0, 8, 0, 0, 0, 1, 0, 0x12, 0x01, 3, 0, 1, 0, 0, 0, o & 255, 0, 0, 0, 0, 0, 0, 0]);
    const seg = new Uint8Array(4 + t.length); seg[0] = 0xFF; seg[1] = 0xE1; seg[2] = (t.length + 2) >> 8; seg[3] = (t.length + 2) & 255; seg.set(t, 4); return seg;
  };
  for (const s of segs) {
    const drop = (s.m === 0xE1) || (s.m >= 0xE3 && s.m <= 0xED) || s.m === 0xEF || s.m === 0xFE;
    if (!drop) {
      if (!inserted && o !== 1 && s.m !== 0xE0) { parts.push(exifMin()); inserted = true; }
      parts.push(b.subarray(s.start, s.end));
    }
  }
  const total = parts.reduce((a, p) => a + p.length, 0); const out = new Uint8Array(total); let k = 0;
  for (const p of parts) { out.set(p, k); k += p.length; }
  return out;
}
function pngMeta(b) {
  const r = { chunks: [] }; if (b[0] !== 0x89 || b[1] !== 0x50) return r;
  let i = 8;
  while (i + 8 <= b.length) {
    const len = ((b[i] << 24) | (b[i + 1] << 16) | (b[i + 2] << 8) | b[i + 3]) >>> 0;
    const type = latin1(b.subarray(i + 4, i + 8));
    if (['tEXt', 'zTXt', 'iTXt', 'eXIf', 'tIME'].includes(type)) r.chunks.push(type);
    i += 12 + len; if (type === 'IEND') break;
  }
  return r;
}
function pngStrip(b) {
  if (b[0] !== 0x89 || b[1] !== 0x50) return b;
  const parts = [b.subarray(0, 8)]; let i = 8;
  while (i + 8 <= b.length) {
    const len = ((b[i] << 24) | (b[i + 1] << 16) | (b[i + 2] << 8) | b[i + 3]) >>> 0;
    const type = latin1(b.subarray(i + 4, i + 8));
    if (!['tEXt', 'zTXt', 'iTXt', 'eXIf', 'tIME'].includes(type)) parts.push(b.subarray(i, i + 12 + len));
    i += 12 + len; if (type === 'IEND') break;
  }
  const out = new Uint8Array(parts.reduce((a, p) => a + p.length, 0)); let k = 0;
  for (const p of parts) { out.set(p, k); k += p.length; }
  return out;
}

/* ---------- immagini ---------- */
async function decodeImage(src) {
  const blob = src instanceof Blob ? src : new Blob([src]);
  try { return await createImageBitmap(blob, { imageOrientation: 'from-image' }); }
  catch (e) {
    // alcuni formati (es. GIF/BMP) passano meglio da <img>
    const url = URL.createObjectURL(blob);
    try {
      const img = await new Promise((res, rej) => { const i = new Image(); i.onload = () => res(i); i.onerror = () => rej(new Error('Formato immagine non leggibile')); i.src = url; });
      return await createImageBitmap(img);
    } finally { URL.revokeObjectURL(url); }
  }
}
function capDims(w, h) { // riduce le dimensioni se superano il limite di memoria del dispositivo
  if (w * h <= CFG.maxCanvas) return [Math.round(w), Math.round(h)];
  const k = Math.sqrt(CFG.maxCanvas / (w * h)); return [Math.max(1, Math.floor(w * k)), Math.max(1, Math.floor(h * k))];
}
function freeCanvas(c) { if (c && c.getContext) { c.width = 0; c.height = 0; } else if (c && c.close) c.close(); }
function canvasOf(w, h) { const c = document.createElement('canvas'); c.width = Math.max(1, Math.round(w)); c.height = Math.max(1, Math.round(h)); return c; }
function drawScaled(src, w, h, bg) {
  [w, h] = capDims(w, h);
  // ridimensionamento a passi per una qualità migliore sulle riduzioni forti
  let cur = src, cw = src.width, ch = src.height;
  while (cw / 2 > w && ch / 2 > h) {
    const t = canvasOf(cw / 2, ch / 2); const g = t.getContext('2d'); g.imageSmoothingQuality = 'high'; g.drawImage(cur, 0, 0, t.width, t.height);
    if (cur !== src) freeCanvas(cur);
    cur = t; cw = t.width; ch = t.height;
  }
  const c = canvasOf(w, h); const g = c.getContext('2d');
  if (bg) { g.fillStyle = bg; g.fillRect(0, 0, c.width, c.height); }
  g.imageSmoothingQuality = 'high'; g.drawImage(cur, 0, 0, c.width, c.height);
  if (cur !== src) freeCanvas(cur);
  return c;
}
const toBlob = (canvas, type, q) => new Promise((res, rej) => canvas.toBlob((b) => b ? res(b) : rej(new Error('Immagine troppo grande per la memoria del dispositivo: riduci le dimensioni.')), type, q));
const _enc = {};
function canEncode(mime) { // es. Safari su iPhone non sa creare file WebP
  if (!(mime in _enc)) { const c = canvasOf(2, 2); _enc[mime] = c.toDataURL(mime).startsWith('data:' + mime); }
  return _enc[mime];
}
function hasAlpha(canvas) {
  const g = canvas.getContext('2d'); const w = Math.min(canvas.width, 400), h = Math.min(canvas.height, 400);
  const t = canvasOf(w, h); const tg = t.getContext('2d'); tg.drawImage(canvas, 0, 0, w, h);
  const d = tg.getImageData(0, 0, w, h).data;
  for (let i = 3; i < d.length; i += 4) if (d[i] < 250) return true;
  return false;
}
const mimeOf = (fmt) => ({ jpg: 'image/jpeg', png: 'image/png', webp: 'image/webp' })[fmt];
const fmtFromFile = (f) => { const e = ext(f.name); return (e === 'jpg' || e === 'jpeg' || e === 'jfif') ? 'jpg' : e === 'png' ? 'png' : e === 'webp' ? 'webp' : (f.type === 'image/jpeg' ? 'jpg' : 'png'); };

async function processImage(file, o) {
  // o: {format:'orig'|'jpg'|'png'|'webp', quality, resize:'none'|'px'|'pct', px, pct, maxKB, bg}
  const src = await bytesOf(file);
  const bmp = await decodeImage(new Blob([src], { type: file.type }));
  const ow = bmp.width, oh = bmp.height;
  let w = ow, h = oh;
  if (o.resize === 'px' && o.px > 0 && Math.max(w, h) > o.px) { const s = o.px / Math.max(w, h); w = Math.round(w * s); h = Math.round(h * s); }
  if (o.resize === 'pct' && o.pct > 0 && o.pct < 100) { w = Math.round(w * o.pct / 100); h = Math.round(h * o.pct / 100); }
  const preCap = w; [w, h] = capDims(w, h); const capped = w < preCap;
  const format = o.format === 'orig' ? fmtFromFile(file) : o.format;
  const mime = mimeOf(format);
  const bg = format === 'jpg' ? (o.bg || '#ffffff') : null;
  let canvas = drawScaled(bmp, w, h, bg);
  bmp.close && bmp.close();
  let q = o.quality / 100;
  let blob = await toBlob(canvas, mime, format === 'png' ? undefined : q);
  if (o.maxKB > 0 && blob.size > o.maxKB * 1024) {
    if (format !== 'png') { // ricerca della qualità più alta che sta nel limite
      let lo = 0.3, hi = q, best = null;
      for (let k = 0; k < 7; k++) { const mid = (lo + hi) / 2; const b = await toBlob(canvas, mime, mid); if (b.size <= o.maxKB * 1024) { best = b; lo = mid; } else hi = mid; }
      if (best) blob = best;
    }
    let guard = 0;
    while (blob.size > o.maxKB * 1024 && guard++ < 12) { // se non basta, riduco le dimensioni
      w = Math.round(w * 0.85); h = Math.round(h * 0.85);
      canvas = drawScaled(canvas, w, h, bg);
      blob = await toBlob(canvas, mime, format === 'png' ? undefined : Math.max(0.5, Math.min(q, 0.75)));
    }
  }
  let note = `${w}×${h} px` + (capped ? ' · ridotta al limite di memoria del dispositivo' : '');
  const unchangedDims = w === ow && h === oh;
  if (blob.size >= file.size && o.format === 'orig' && unchangedDims && !(o.maxKB > 0)) {
    // la ricodifica non conviene: restituisco l'originale ripulito dai metadati
    const clean = format === 'jpg' ? jpegStrip(src, jpegOrientation(src)) : format === 'png' ? pngStrip(src) : src;
    return { blob: new Blob([clean], { type: mime }), name: file.name, w, h, note: 'già ottimizzata: tenuta la versione originale (metadati rimossi)' };
  }
  return { blob, name: base(file.name) + (o.suffix || '') + '.' + format, w, h, note };
}

/* ---------- PDF: unione ---------- */
const PAGE = { A4: [595.28, 841.89], Letter: [612, 792] };
async function embedImageFile(out, file, o) {
  const b = await bytesOf(file);
  const isJpg = b[0] === 0xFF && b[1] === 0xD8, isPng = b[0] === 0x89 && b[1] === 0x50;
  if (!o.optimize) {
    try {
      if (isJpg && jpegOrientation(b) === 1) { const img = await out.embedJpg(jpegStrip(b, 1)); return img; }
      if (isPng) return await out.embedPng(pngStrip(b));
    } catch (e) { /* passo alla ricodifica */ }
  }
  const bmp = await decodeImage(new Blob([b], { type: file.type }));
  let w = bmp.width, h = bmp.height; const maxPx = o.optimize ? (o.maxPx || 2200) : 6000;
  if (Math.max(w, h) > maxPx) { const s = maxPx / Math.max(w, h); w = Math.round(w * s); h = Math.round(h * s); }
  let c = drawScaled(bmp, w, h, null);
  const alpha = isPng && hasAlpha(c);
  if (alpha) return await out.embedPng(new Uint8Array(await (await toBlob(c, 'image/png')).arrayBuffer()));
  const c0 = c; c = drawScaled(c, w, h, '#ffffff'); freeCanvas(c0);
  return await out.embedJpg(new Uint8Array(await (await toBlob(c, 'image/jpeg', o.optimize ? (o.quality || 0.85) : 0.92)).arrayBuffer()));
}
function placeImage(out, img, o) {
  const mm = (o.margin || 0) * 72 / 25.4;
  const iw = img.width * 0.75, ih = img.height * 0.75; // 96 dpi
  let pw, ph;
  if (o.pageSize === 'image') { pw = iw + 2 * mm; ph = ih + 2 * mm; }
  else {
    [pw, ph] = PAGE[o.pageSize] || PAGE.A4;
    const land = o.orientation === 'landscape' || (o.orientation === 'auto' && img.width > img.height);
    if (land) [pw, ph] = [ph, pw];
  }
  const page = out.addPage([pw, ph]);
  const s = o.pageSize === 'image' ? 1 : Math.min((pw - 2 * mm) / iw, (ph - 2 * mm) / ih);
  const dw = iw * s, dh = ih * s;
  page.drawImage(img, { x: (pw - dw) / 2, y: (ph - dh) / 2, width: dw, height: dh });
}
async function mergeToPdf(files, o, progress) {
  const out = await PDFDocument.create({ updateMetadata: false });
  for (let i = 0; i < files.length; i++) {
    const f = files[i]; const k = kind(f);
    progress(i / files.length, 'Elaboro ' + f.name);
    if (k === 'pdf') {
      const { doc } = await loadPdf(await bytesOf(f), f.name);
      const pages = await out.copyPages(doc, doc.getPageIndices());
      pages.forEach((p) => out.addPage(p));
    } else if (k === 'image') {
      placeImage(out, await embedImageFile(out, f, o), o);
    }
    await tick();
  }
  progress(0.97, 'Salvataggio');
  return await save(out);
}

/* ---------- PDF: compressione ---------- */
function unpredict(data, w, comps, bpc, pred) {
  if (!pred || pred < 10) return data;
  const bpp = Math.max(1, (comps * bpc) >> 3), rowLen = Math.ceil(w * comps * bpc / 8);
  const rows = Math.floor(data.length / (rowLen + 1));
  const out = new Uint8Array(rows * rowLen); const prev = new Uint8Array(rowLen);
  for (let r = 0; r < rows; r++) {
    const ft = data[r * (rowLen + 1)]; const row = data.subarray(r * (rowLen + 1) + 1, (r + 1) * (rowLen + 1));
    const cur = out.subarray(r * rowLen, (r + 1) * rowLen);
    for (let i = 0; i < rowLen; i++) {
      const a = i >= bpp ? cur[i - bpp] : 0, b = prev[i], c = i >= bpp ? prev[i - bpp] : 0; let v = row[i];
      if (ft === 1) v += a; else if (ft === 2) v += b; else if (ft === 3) v += (a + b) >> 1;
      else if (ft === 4) { const p = a + b - c, pa = Math.abs(p - a), pb = Math.abs(p - b), pc = Math.abs(p - c); v += (pa <= pb && pa <= pc) ? a : pb <= pc ? b : c; }
      cur[i] = v & 255;
    }
    prev.set(cur);
  }
  return out;
}
function colorComps(cs, ctx) {
  if (!cs) return 0;
  if (cs instanceof PDFName) return { '/DeviceRGB': 3, '/DeviceGray': 1, '/CalRGB': 3, '/CalGray': 1 }[cs.toString()] || 0;
  if (cs instanceof PDFArray) {
    const t = cs.lookup(0); const tn = t && t.toString();
    if (tn === '/ICCBased') { const s = cs.lookup(1); const n = s && s.dict && s.dict.lookup(N('N')); const v = n ? n.asNumber() : 0; return v === 3 || v === 1 ? v : 0; }
    if (tn === '/CalRGB') return 3; if (tn === '/CalGray') return 1;
  }
  return 0; // Indexed, Separation, Lab, CMYK: non tocco
}
const PRESETS = {
  alta: { maxPx: 2500, q: 0.80, dpi: 200, rq: 0.75 },
  media: { maxPx: 1750, q: 0.70, dpi: 150, rq: 0.65 },
  forte: { maxPx: 1200, q: 0.55, dpi: 110, rq: 0.55 },
};
async function compressSmart(bytes, name, o, progress) {
  const { doc } = await loadPdf(bytes, name);
  const ctx = doc.context;
  const objs = ctx.enumerateIndirectObjects();
  const masks = new Set();
  for (const [, ob] of objs) {
    if (ob instanceof PDFRawStream) { for (const k of ['SMask', 'Mask']) { const m = ob.dict.get(N(k)); if (m instanceof PDFRef) masks.add(m.toString()); } }
  }
  const imgs = objs.filter(([r, ob]) => ob instanceof PDFRawStream && ob.dict.lookup(N('Subtype')) === N('Image'));
  const st = { images: imgs.length, done: 0, skipped: 0, streams: 0 };
  for (let i = 0; i < imgs.length; i++) {
    const [ref, ob] = imgs[i]; const d = ob.dict;
    progress(0.05 + 0.8 * i / Math.max(1, imgs.length), `Immagine ${i + 1} di ${imgs.length}`);
    try {
      if (masks.has(ref.toString())) { st.skipped++; continue; }
      const im = d.lookup(N('ImageMask')); if (im && im.toString() === 'true') { st.skipped++; continue; }
      if (d.has(N('Decode')) || d.lookup(N('Mask')) instanceof PDFArray) { st.skipped++; continue; }
      const bpcO = d.lookup(N('BitsPerComponent')); const bpc = bpcO ? bpcO.asNumber() : 8;
      const w = d.lookup(N('Width')).asNumber(), h = d.lookup(N('Height')).asNumber();
      if (w * h < 40000) { st.skipped++; continue; } // loghi e icone: inutile
      const F = d.lookup(N('Filter'));
      const filters = F instanceof PDFArray ? F.asArray().map((x) => x.toString()) : F ? [F.toString()] : [];
      let source; // canvas o bitmap
      const DEC = ['/FlateDecode', '/ASCII85Decode', '/ASCIIHexDecode', '/LZWDecode', '/RunLengthDecode'];
      const decodeChain = (fl) => { // decodifica i filtri senza perdita che precedono l'immagine
        if (!fl.length) return ob.contents;
        const td = ctx.obj({}); td.set(N('Filter'), ctx.obj(fl.map((x) => x.slice(1))));
        const dp = d.lookup(N('DecodeParms')); if (dp) td.set(N('DecodeParms'), dp);
        return L.decodePDFRawStream({ dict: td, contents: ob.contents }).decode();
      };
      if (filters.length && filters[filters.length - 1] === '/DCTDecode' && filters.slice(0, -1).every((x) => DEC.includes(x))) {
        if (colorComps(d.lookup(N('ColorSpace')), ctx) === 0) { st.skipped++; continue; }
        const jb = jpegStrip(decodeChain(filters.slice(0, -1)), 1);
        source = await createImageBitmap(new Blob([jb], { type: 'image/jpeg' }));
      } else if (bpc === 8 && filters.every((x) => DEC.includes(x))) {
        const comps = colorComps(d.lookup(N('ColorSpace')), ctx); if (!comps) { st.skipped++; continue; }
        let raw = decodeChain(filters);
        let dp = d.lookup(N('DecodeParms'));
        if (dp instanceof PDFArray) dp = dp.asArray().map((x) => ctx.lookup(x)).find((x) => x instanceof PDFDict && x.has(N('Predictor')));
        const pred = dp instanceof PDFDict && dp.lookup(N('Predictor')) ? dp.lookup(N('Predictor')).asNumber() : 1;
        if (pred === 2) { st.skipped++; continue; }
        raw = unpredict(raw, w, comps, 8, pred);
        if (raw.length < w * h * comps) { st.skipped++; continue; }
        if (w * h > CFG.maxCanvas) { st.skipped++; continue; }
        const c = canvasOf(w, h); const g = c.getContext('2d'); const id = g.createImageData(w, h); const px = id.data;
        for (let p = 0, q = 0; p < w * h; p++, q += comps) {
          if (comps === 3) { px[p * 4] = raw[q]; px[p * 4 + 1] = raw[q + 1]; px[p * 4 + 2] = raw[q + 2]; }
          else { px[p * 4] = px[p * 4 + 1] = px[p * 4 + 2] = raw[q]; }
          px[p * 4 + 3] = 255;
        }
        g.putImageData(id, 0, 0); source = c;
      } else { st.skipped++; continue; }
      let nw = w, nh = h;
      if (Math.max(w, h) > o.maxPx) { const s = o.maxPx / Math.max(w, h); nw = Math.round(w * s); nh = Math.round(h * s); }
      const c2 = drawScaled(source, nw, nh, '#ffffff');
      freeCanvas(source);
      const jpg = new Uint8Array(await (await toBlob(c2, 'image/jpeg', o.q)).arrayBuffer()); freeCanvas(c2);
      if (jpg.length < ob.contents.length * 0.9) {
        const nd = ctx.obj({ Type: 'XObject', Subtype: 'Image', Width: nw, Height: nh, ColorSpace: 'DeviceRGB', BitsPerComponent: 8, Filter: 'DCTDecode' });
        for (const k of ['SMask', 'Mask', 'Interpolate', 'Intent']) { const v = d.get(N(k)); if (v) nd.set(N(k), v); }
        ctx.assign(ref, PDFRawStream.of(nd, jpg));
        st.done++;
      } else st.skipped++;
    } catch (e) { st.skipped++; }
    if (i % 3 === 0) await tick();
  }
  // flussi non compressi (testo, grafica) -> compressione senza perdita
  progress(0.88, 'Compressione strutture del documento');
  for (const [ref, ob] of ctx.enumerateIndirectObjects()) {
    if (!(ob instanceof PDFRawStream) || ob.dict.has(N('Filter')) || ob.contents.length < 2048) continue;
    const t = ob.dict.lookup(N('Type')); if (t && (t.toString() === '/Metadata' || t.toString() === '/XRef')) continue;
    if (ob.dict.lookup(N('Subtype')) === N('Image')) continue;
    try {
      const z = new Uint8Array(await new Response(new Blob([ob.contents]).stream().pipeThrough(new CompressionStream('deflate'))).arrayBuffer());
      if (z.length < ob.contents.length * 0.9) { const nd = ob.dict.clone(ctx); nd.set(N('Filter'), N('FlateDecode')); ctx.assign(ref, PDFRawStream.of(nd, z)); st.streams++; }
    } catch (e) {}
  }
  if (o.stripMeta) stripPdfMetadata(doc);
  progress(0.95, 'Salvataggio');
  return { bytes: await save(doc), stats: st };
}
async function rasterizePdf(bytes, name, o, progress, pagesFilter) {
  const pdf = await openPdfJs(bytes, name);
  const out = await PDFDocument.create({ updateMetadata: false });
  for (let i = 1; i <= pdf.numPages; i++) {
    progress(i / (pdf.numPages + 1), `Pagina ${i} di ${pdf.numPages}`);
    const r = await renderPage(pdf, i, o.dpi / 72);
    if (o.draw) o.draw(i, r.canvas);
    const jpg = new Uint8Array(await (await toBlob(r.canvas, 'image/jpeg', o.q)).arrayBuffer()); freeCanvas(r.canvas);
    const img = await out.embedJpg(jpg);
    const page = out.addPage([r.width, r.height]);
    page.drawImage(img, { x: 0, y: 0, width: r.width, height: r.height });
    await tick();
  }
  pdf.destroy();
  return await save(out);
}

/* ---------- PDF: pagine ---------- */
function parseRanges(txt, total) {
  // "1-3, 5, 8-" -> [[0,1,2],[4],[7..]]
  const groups = [];
  for (const part of String(txt).split(/[,;]+/).map((s) => s.trim()).filter(Boolean)) {
    const m = part.match(/^(\d*)\s*-\s*(\d*)$/);
    let a, b;
    if (m) { a = m[1] ? +m[1] : 1; b = m[2] ? +m[2] : total; }
    else if (/^\d+$/.test(part)) { a = b = +part; }
    else throw new Error('Intervallo non valido: «' + part + '». Esempio corretto: 1-3, 5, 8-10');
    if (a < 1 || b > total || a > b) throw new Error(`Intervallo «${part}» fuori dal documento (pagine 1-${total}).`);
    const g = []; for (let k = a; k <= b; k++) g.push(k - 1); groups.push(g);
  }
  if (!groups.length) throw new Error('Indica almeno una pagina o un intervallo.');
  return groups;
}
async function extractPages(doc, indices) {
  const out = await PDFDocument.create({ updateMetadata: false });
  const pages = await out.copyPages(doc, indices);
  pages.forEach((p) => out.addPage(p));
  return await save(out);
}
async function buildFromPages(docs, list) {
  // list: [{doc: index, page: index, rot: deg}]
  const out = await PDFDocument.create({ updateMetadata: false });
  for (const it of list) {
    const [p] = await out.copyPages(docs[it.doc], [it.page]);
    if (it.rot) p.setRotation(degrees((p.getRotation().angle + it.rot + 360) % 360));
    out.addPage(p);
  }
  return await save(out);
}

/* ---------- PDF: testo sovrapposto (numeri, filigrana) ---------- */
function visualFrame(page) {
  const r = ((page.getRotation().angle % 360) + 360) % 360;
  const box = page.getCropBox ? page.getCropBox() : page.getMediaBox();
  const W = box.width, H = box.height, ox = box.x, oy = box.y;
  const vw = (r === 90 || r === 270) ? H : W, vh = (r === 90 || r === 270) ? W : H;
  const map = (vx, vy) => {
    let x, y;
    if (r === 0) { x = vx; y = vy; } else if (r === 90) { x = W - vy; y = vx; }
    else if (r === 180) { x = W - vx; y = H - vy; } else { x = vy; y = H - vx; }
    return { x: x + ox, y: y + oy };
  };
  return { r, vw, vh, map };
}
const COLORS = { grigio: rgb(0.45, 0.45, 0.45), nero: rgb(0, 0, 0), blu: rgb(0, 0.216, 0.506), rosso: rgb(0.78, 0.16, 0.16) };
async function addPageNumbers(bytes, name, o) {
  const { doc } = await loadPdf(bytes, name);
  const font = await doc.embedFont(o.bold ? StandardFonts.HelveticaBold : StandardFonts.Helvetica);
  const pages = doc.getPages(); const tot = pages.length;
  const skip = Math.max(0, o.skip | 0);
  const totShown = tot - skip + (o.start - 1);
  const m = (o.margin || 12) * 72 / 25.4;
  pages.forEach((p, i) => {
    if (i < skip) return;
    const n = i - skip + (+o.start || 1);
    const txt = o.format.replace('{n}', n).replace('{tot}', totShown);
    const f = visualFrame(p); const size = +o.size || 10;
    const tw = font.widthOfTextAtSize(txt, size);
    const [vert, hor] = o.position.split('-');
    let vx = hor === 'sx' ? m : hor === 'dx' ? f.vw - m - tw : (f.vw - tw) / 2;
    if (o.mirror && hor !== 'centro' && (n % 2 === 0)) vx = hor === 'sx' ? f.vw - m - tw : m;
    const vy = vert === 'alto' ? f.vh - m - size * 0.75 : m;
    const pt = f.map(vx, vy);
    p.drawText(txt, { x: pt.x, y: pt.y, size, font, color: COLORS[o.color] || COLORS.grigio, rotate: degrees(f.r) });
  });
  return await save(doc);
}
async function addWatermark(bytes, name, o) {
  const { doc } = await loadPdf(bytes, name);
  const font = await doc.embedFont(StandardFonts.HelveticaBold);
  const txt = o.text || 'RISERVATO';
  for (const p of doc.getPages()) {
    const f = visualFrame(p);
    let size = +o.size || 0;
    const ang = (+o.angle || 0) * Math.PI / 180;
    if (!size) { // automatica: la diagonale occupa ~70% della pagina
      const diag = o.mode === 'mosaico' ? Math.min(f.vw, f.vh) * 0.45 : Math.hypot(f.vw, f.vh) * 0.62;
      size = Math.max(10, Math.min(140, diag / Math.max(1, font.widthOfTextAtSize(txt, 1))));
    }
    const tw = font.widthOfTextAtSize(txt, size), th = size * 0.7;
    const draw = (cx, cy) => {
      const vx = cx - (tw / 2) * Math.cos(ang) + (th / 2) * Math.sin(ang);
      const vy = cy - (tw / 2) * Math.sin(ang) - (th / 2) * Math.cos(ang);
      const pt = f.map(vx, vy);
      p.drawText(txt, { x: pt.x, y: pt.y, size, font, color: COLORS[o.color] || COLORS.grigio, opacity: (+o.opacity || 25) / 100, rotate: degrees(f.r + (+o.angle || 0)) });
    };
    if (o.mode === 'mosaico') {
      const stepX = tw * 0.9 + size * 2, stepY = size * 4.2;
      for (let y = -f.vh * 0.2, row = 0; y < f.vh * 1.2; y += stepY, row++) for (let x = -f.vw * 0.2 + (row % 2) * stepX / 2; x < f.vw * 1.2; x += stepX) draw(x, y);
    } else draw(f.vw / 2, f.vh / 2);
  }
  return await save(doc);
}

/* ---------- PDF: password ---------- */
async function protectPdf(bytes, name, o) {
  const { doc } = await loadPdf(bytes, name);
  const owner = o.owner || Array.from(crypto.getRandomValues(new Uint8Array(18)), (b) => b.toString(36).padStart(2, '0')).join('');
  doc.encrypt({
    userPassword: o.user, ownerPassword: owner,
    permissions: { printing: o.print ? 'highResolution' : false, copying: !!o.copy, modifying: !!o.modify, annotating: !!o.modify, fillingForms: true, contentAccessibility: true, documentAssembly: !!o.modify },
  });
  return { bytes: await save(doc), owner };
}
async function unlockPdf(bytes, name) {
  const { doc, encrypted } = await loadPdf(bytes, name);
  return { bytes: await save(doc), encrypted };
}

/* ---------- Office (docx/xlsx/pptx/odt...) ---------- */
const clearTag = (x, tag) => x.replace(new RegExp('(<' + tag + '\\b[^>]*>)[\\s\\S]*?(</' + tag + '>)', 'g'), '$1$2');
async function compressOffice(file, o, progress) {
  const zip = await JSZip.loadAsync(await file.arrayBuffer());
  const st = { images: 0, done: 0, saved: 0 };
  const names = Object.keys(zip.files);
  const media = names.filter((n) => /(^|\/)(media|Pictures)\//i.test(n) && /\.(jpe?g|png)$/i.test(n) && !zip.files[n].dir);
  st.images = media.length;
  const renames = []; // PNG senza trasparenza diventati JPEG: [vecchio percorso, nuovo percorso]
  for (let i = 0; i < media.length; i++) {
    const n = media[i]; progress(0.05 + 0.8 * i / Math.max(1, media.length), 'Immagine ' + (i + 1) + ' di ' + media.length);
    try {
      const b = await zip.file(n).async('uint8array');
      const isPng = /\.png$/i.test(n);
      const bmp = await decodeImage(new Blob([b]));
      let w = bmp.width, h = bmp.height;
      if (Math.max(w, h) > o.maxPx) { const s = o.maxPx / Math.max(w, h); w = Math.round(w * s); h = Math.round(h * s); }
      const c = drawScaled(bmp, w, h, null);
      const scaled = w !== bmp.width;
      bmp.close && bmp.close();
      if (!isPng) {
        const nb = new Uint8Array(await (await toBlob(drawScaled(c, w, h, '#ffffff'), 'image/jpeg', o.q)).arrayBuffer());
        if (nb.length < b.length * 0.92) { zip.file(n, nb, { createFolders: false }); st.done++; st.saved += b.length - nb.length; }
      } else if (!hasAlpha(c)) {
        // screenshot e foto incollate come PNG: diventano JPEG (si aggiornano i riferimenti interni)
        const nb = new Uint8Array(await (await toBlob(drawScaled(c, w, h, '#ffffff'), 'image/jpeg', o.q)).arrayBuffer());
        if (nb.length < b.length * 0.85) {
          let nn = n.replace(/\.png$/i, '.jpeg'); let k = 2;
          while (zip.file(nn)) nn = n.replace(/\.png$/i, '_' + k++ + '.jpeg');
          zip.remove(n); zip.file(nn, nb, { createFolders: false }); renames.push([n, nn]); st.done++; st.saved += b.length - nb.length;
        }
      } else if (scaled) {
        const nb = new Uint8Array(await (await toBlob(c, 'image/png')).arrayBuffer());
        if (nb.length < b.length * 0.92) { zip.file(n, nb, { createFolders: false }); st.done++; st.saved += b.length - nb.length; }
      }
    } catch (e) {}
    await tick();
  }
  if (renames.length) {
    const texts = Object.keys(zip.files).filter((n) => /\.(xml|rels|vml)$/i.test(n) && !zip.files[n].dir);
    for (const t of texts) {
      let x = await zip.file(t).async('string'); const before = x;
      for (const [a, b] of renames) {
        const tail = (p) => p.split('/').slice(-2).join('/'); // es. media/image1.png
        x = x.split(tail(a)).join(tail(b));
        x = x.replace(new RegExp('<[^>]*' + tail(b).replace(/[.*+?^${}()|[\]\\]/g, '\\$&') + '[^>]*>', 'g'), (m) => m.replace(/image\/png/g, 'image/jpeg'));
      }
      if (t === '[Content_Types].xml' && !/Extension="jpeg"/i.test(x)) x = x.replace(/<Types\b[^>]*>/, (m) => m + '<Default Extension="jpeg" ContentType="image/jpeg"/>');
      if (x !== before) zip.file(t, x, { createFolders: false });
    }
  }
  if (o.stripMeta) {
    const edit = async (path, tags) => { const f = zip.file(path); if (!f) return; let x = await f.async('string'); for (const t of tags) x = clearTag(x, t); zip.file(path, x, { createFolders: false }); };
    await edit('docProps/core.xml', ['dc:creator', 'cp:lastModifiedBy']);
    await edit('docProps/app.xml', ['Company', 'Manager']);
    await edit('meta.xml', ['dc:creator', 'meta:initial-creator']);
  }
  for (const n of Object.keys(zip.files)) if (zip.files[n].dir && !names.includes(n)) zip.remove(n); // niente cartelle aggiunte
  progress(0.9, 'Ricostruzione del file');
  const opts = { type: 'blob', compression: 'DEFLATE', compressionOptions: { level: 9 }, mimeType: file.type || 'application/octet-stream' };
  if (zip.file('mimetype')) { // OpenDocument: «mimetype» deve essere il primo file e non compresso
    const mt = await zip.file('mimetype').async('string'); zip.remove('mimetype');
    const z2 = new JSZip(); z2.file('mimetype', mt, { compression: 'STORE' });
    for (const n of Object.keys(zip.files)) { const f = zip.files[n]; if (!f.dir) z2.file(n, await f.async('uint8array'), { createFolders: false }); }
    return { blob: await z2.generateAsync(opts), stats: st };
  }
  return { blob: await zip.generateAsync(opts), stats: st };
}

/* ---------- testo per oscuramento ---------- */
const PATTERNS = {
  iban: { label: 'IBAN', re: /(?:IT|SM)\d{2}[A-Z]\d{10}[0-9A-Z]{12}/g },
  cf: { label: 'Codice fiscale', re: /[A-Z]{6}[0-9LMNPQRSTUV]{2}[ABCDEHLMPRST][0-9LMNPQRSTUV]{2}[A-Z][0-9LMNPQRSTUV]{3}[A-Z]/g },
  piva: { label: 'Partita IVA', re: /(?:P\.?IVA:?|PARTITAIVA:?|VAT:?)(IT)?\d{11}/g },
  email: { label: 'Email', re: /[A-Z0-9._%+-]+@[A-Z0-9.-]+\.[A-Z]{2,}/g },
  tel: { label: 'Telefono', re: /(?:\+39|0039)?(?:3\d{8,9}|0\d{6,10})(?!\d)/g },
  // lookbehind creato a runtime: su iPhone con iOS < 16.4 una regex letterale con lookbehind bloccherebbe l'intero file
  carta: { label: 'Carta di pagamento', re: (() => { try { return new RegExp('(?<!\\d)(?:\\d{4}){3,4}\\d{0,3}(?!\\d)', 'g'); } catch (e) { return /(?:\d{4}){3,4}\d{0,3}(?!\d)/g; } })() },
};
let _mctx = null;
const measure = (t) => { if (!_mctx) { _mctx = document.createElement('canvas').getContext('2d'); _mctx.font = '100px Helvetica, Arial, sans-serif'; } return _mctx.measureText(t).width; };
async function findText(pdf, pageNum, queries) {
  // restituisce riquadri normalizzati (0..1) nella pagina visualizzata
  const page = await pdf.getPage(pageNum); const vp = page.getViewport({ scale: 1 });
  const tc = await page.getTextContent();
  const map = []; let s = '';
  tc.items.forEach((it, ii) => { if (it.str) for (let k = 0; k < it.str.length; k++) { const ch = it.str[k]; if (/\s/.test(ch)) continue; s += ch.toUpperCase(); map.push([ii, k]); } if (it.hasEOL) { s += '|'; map.push(null); } }); // '|' = fine riga: le ricerche non scavalcano le righe
  const boxes = [];
  const addRange = (a, b) => {
    const per = new Map();
    for (let k = a; k < b; k++) { if (!map[k]) continue; const [ii, ci] = map[k]; const r = per.get(ii) || [Infinity, -1]; r[0] = Math.min(r[0], ci); r[1] = Math.max(r[1], ci); per.set(ii, r); }
    for (const [ii, [c0, c1]] of per) {
      const it = tc.items[ii]; const [a1, b1, , , e, f] = it.transform;
      const len = Math.max(1, it.str.length); const wd = it.width || 0; const ht = it.height || Math.hypot(it.transform[2], it.transform[3]) || 10;
      const nrm = Math.hypot(a1, b1) || 1; const ux = a1 / nrm, uy = b1 / nrm; const vx = -uy, vy = ux;
      const full = measure(it.str) || len; const pad = 0.3 * ht;
      const x0 = Math.max(0, wd * measure(it.str.slice(0, c0)) / full - pad), x1 = Math.min(wd + pad, wd * measure(it.str.slice(0, c1 + 1)) / full + pad);
      const pts = [[x0, -0.28 * ht], [x1, -0.28 * ht], [x0, 1.05 * ht], [x1, 1.05 * ht]].map(([px, py]) => vp.convertToViewportPoint(e + ux * px + vx * py, f + uy * px + vy * py));
      const xs = pts.map((p) => p[0]), ys = pts.map((p) => p[1]);
      boxes.push({ x: Math.min(...xs) / vp.width, y: Math.min(...ys) / vp.height, w: (Math.max(...xs) - Math.min(...xs)) / vp.width, h: (Math.max(...ys) - Math.min(...ys)) / vp.height, auto: true });
    }
  };
  for (const q of queries) {
    let re;
    if (q.re) re = new RegExp(q.re.source, 'g');
    else { const t = q.text.replace(/\s+/g, '').toUpperCase(); if (!t) continue; re = new RegExp(t.replace(/[.*+?^${}()|[\]\\]/g, '\\$&'), 'g'); }
    let m; while ((m = re.exec(s))) { if (!m[0].length) { re.lastIndex++; continue; } addRange(m.index, m.index + m[0].length); }
  }
  page.cleanup();
  return { boxes, hasText: map.some(Boolean) };
}
async function redactPdf(bytes, name, boxesByPage, o, progress) {
  const { doc } = await loadPdf(bytes, name);
  const pdf = await openPdfJs(bytes, name);
  const out = await PDFDocument.create({ updateMetadata: false });
  const total = pdf.numPages;
  for (let i = 1; i <= total; i++) {
    progress(i / (total + 1), `Pagina ${i} di ${total}`);
    const boxes = boxesByPage[i] || [];
    if (boxes.length || o.all) {
      const r = await renderPage(pdf, i, o.dpi / 72);
      const g = r.canvas.getContext('2d'); g.fillStyle = '#000';
      for (const b of boxes) g.fillRect(Math.floor(b.x * r.canvas.width) - 1, Math.floor(b.y * r.canvas.height) - 1, Math.ceil(b.w * r.canvas.width) + 2, Math.ceil(b.h * r.canvas.height) + 2);
      const img = await out.embedJpg(new Uint8Array(await (await toBlob(r.canvas, 'image/jpeg', 0.9)).arrayBuffer())); freeCanvas(r.canvas);
      const p = out.addPage([r.width, r.height]); p.drawImage(img, { x: 0, y: 0, width: r.width, height: r.height });
    } else {
      const [p] = await out.copyPages(doc, [i - 1]); out.addPage(p);
    }
    await tick();
  }
  pdf.destroy();
  return await save(out);
}

/* ---------- immagini: unione ---------- */
function composeImages(bmps, o, scaleCap) {
  // o: layout 'v'|'h'|'g', cols, uniform 'min'|'max'|'none', gap, bg, maxPx
  const n = bmps.length; if (!n) return null;
  const sizes = bmps.map((b) => ({ w: b.width, h: b.height }));
  const L = o.layout; const cols = L === 'v' ? 1 : L === 'h' ? n : Math.max(1, Math.min(n, o.cols | 0 || 2));
  // misura comune
  let ref = null;
  if (o.uniform !== 'none') {
    const dimVals = sizes.map((s) => L === 'h' ? s.h : s.w);
    ref = o.uniform === 'min' ? Math.min(...dimVals) : Math.max(...dimVals);
  }
  const sc = sizes.map((s) => { if (!ref) return { w: s.w, h: s.h }; const f = L === 'h' ? ref / s.h : ref / s.w; return { w: s.w * f, h: s.h * f }; });
  const rows = Math.ceil(n / cols); const gap = +o.gap || 0;
  const colW = [], rowH = [];
  for (let i = 0; i < n; i++) { const r = Math.floor(i / cols), c = i % cols; colW[c] = Math.max(colW[c] || 0, sc[i].w); rowH[r] = Math.max(rowH[r] || 0, sc[i].h); }
  let W = colW.reduce((a, b) => a + b, 0) + gap * (cols + 1), H = rowH.reduce((a, b) => a + b, 0) + gap * (rows + 1);
  let k = 1; if (o.maxPx && Math.max(W, H) > o.maxPx) k = o.maxPx / Math.max(W, H);
  if (scaleCap) k = Math.min(k, scaleCap / Math.max(W, H));
  if (W * k * H * k > CFG.maxCanvas) k = Math.sqrt(CFG.maxCanvas / (W * H));
  const c = canvasOf(W * k, H * k); const g = c.getContext('2d'); g.imageSmoothingQuality = 'high';
  if (o.bg !== 'transparent') { g.fillStyle = o.bg; g.fillRect(0, 0, c.width, c.height); }
  let y = gap;
  for (let r = 0; r < rows; r++) {
    let x = gap;
    for (let cI = 0; cI < cols; cI++) {
      const i = r * cols + cI; if (i >= n) break;
      const dx = x + (colW[cI] - sc[i].w) / 2, dy = y + (rowH[r] - sc[i].h) / 2;
      g.drawImage(bmps[i], dx * k, dy * k, sc[i].w * k, sc[i].h * k);
      x += colW[cI] + gap;
    }
    y += rowH[r] + gap;
  }
  return c;
}

/* ---------- ZIP ---------- */
async function makeZip(items, level) {
  const z = new JSZip(); const used = new Set();
  for (const it of items) {
    let nm = it.name; let k = 2;
    while (used.has(nm.toLowerCase())) { nm = base(it.name) + ' (' + k++ + ')' + (ext(it.name) ? '.' + ext(it.name) : ''); }
    used.add(nm.toLowerCase()); z.file(nm, it.blob || it);
  }
  return await z.generateAsync({ type: 'blob', compression: level === 0 ? 'STORE' : 'DEFLATE', compressionOptions: { level: level || 6 } });
}
async function unzip(file) {
  const z = await JSZip.loadAsync(await file.arrayBuffer()); const out = [];
  for (const n of Object.keys(z.files)) { const f = z.files[n]; if (f.dir) continue; out.push({ name: n.split('/').pop(), path: n, blob: await f.async('blob') }); }
  return out;
}

return {
  fmt, ext, base, kind, bytesOf, tick, pdfBlob, pdfjs, openPdfJs, openPdfJsQuiet, renderPage, loadPdf, save, hasSignature, pdfInfo, stripPdfMetadata,
  jpegMeta, jpegStrip, jpegOrientation, pngMeta, pngStrip, decodeImage, drawScaled, toBlob, canvasOf, processImage, mimeOf,
  mergeToPdf, compressSmart, rasterizePdf, PRESETS, parseRanges, extractPages, buildFromPages, addPageNumbers, addWatermark,
  protectPdf, unlockPdf, capDims, freeCanvas, canEncode, CFG, compressOffice, PATTERNS, findText, redactPdf, composeImages, makeZip, unzip, PDFDocument,
  setAskPassword: (fn) => { askPassword = fn; }, passwords,
};
})();
window.Core = Core;
