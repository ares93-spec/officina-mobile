'use strict';
/* =========================================================================
   OFFICINA DOCUMENTI — versione mobile (iPhone e Android)
   Interfaccia pensata per il dito; il motore (core.js) è lo stesso del PC.
   ========================================================================= */
(() => {
const C = window.Core;
const CFG = window.OFFICINA_CONFIG || {};
const $ = (s, el = document) => el.querySelector(s);
function h(tag, attrs, ...kids) {
  const el = document.createElement(tag);
  for (const [k, v] of Object.entries(attrs || {})) {
    if (v === null || v === undefined || v === false) continue;
    if (k === 'class') el.className = v;
    else if (k === 'text') el.textContent = v;
    else if (k === 'html') el.innerHTML = v;
    else if (k === 'style' && typeof v === 'object') Object.assign(el.style, v);
    else if (k.startsWith('on') && typeof v === 'function') el.addEventListener(k.slice(2), v);
    else if (v === true) el.setAttribute(k, '');
    else el.setAttribute(k, v);
  }
  for (const kd of kids.flat()) if (kd !== null && kd !== undefined && kd !== false) el.append(kd instanceof Node ? kd : document.createTextNode(String(kd)));
  return el;
}
const esc = (s) => String(s).replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' })[c]);
const app = $('#app'), bar = $('#actionbar');
const isIOS = /iP(hone|ad|od)/.test(navigator.userAgent) || (navigator.platform === 'MacIntel' && navigator.maxTouchPoints > 1);
const isStandalone = () => window.matchMedia('(display-mode: standalone)').matches || navigator.standalone === true;
const store = {
  get(k) { try { return JSON.parse(localStorage.getItem('officina.m.' + k) || 'null'); } catch (e) { return null; } },
  set(k, v) { try { localStorage.setItem('officina.m.' + k, JSON.stringify(v)); } catch (e) {} },
};

/* ---------- icone ---------- */
const P = (d, s = 22) => `<svg viewBox="0 0 24 24" width="${s}" height="${s}" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round">${d}</svg>`;
const ICON = {
  pdfz: P('<path d="M14 3H7a2 2 0 0 0-2 2v14a2 2 0 0 0 2 2h10a2 2 0 0 0 2-2V8z"/><path d="M14 3v5h5"/><path d="M9 13l3 3 3-3M12 10v6"/>'),
  imgz: P('<rect x="3" y="4" width="18" height="16" rx="2"/><circle cx="9" cy="10" r="2"/><path d="M21 16l-5-5-8 9"/>'),
  merge: P('<rect x="3" y="3" width="8" height="10" rx="1.5"/><rect x="13" y="3" width="8" height="10" rx="1.5"/><path d="M7 13v3a2 2 0 0 0 2 2h6a2 2 0 0 0 2-2v-3M12 18v3"/>'),
  collage: P('<rect x="3" y="3" width="18" height="18" rx="2"/><path d="M3 12h18M12 3v9"/>'),
  pages: P('<rect x="3" y="3" width="7" height="9" rx="1"/><rect x="14" y="3" width="7" height="9" rx="1"/><rect x="3" y="14" width="7" height="7" rx="1"/><path d="M17.5 14v7M14 17.5h7"/>'),
  meta: P('<circle cx="11" cy="11" r="7"/><path d="M21 21l-4.5-4.5M8 11h6"/>'),
  lock: P('<rect x="4" y="11" width="16" height="10" rx="2"/><path d="M8 11V7a4 4 0 0 1 8 0v4"/>'),
  share: P('<path d="M12 3v12M7 8l5-5 5 5"/><path d="M5 12v7a2 2 0 0 0 2 2h10a2 2 0 0 0 2-2v-7"/>', 18),
  add: P('<path d="M12 5v14M5 12h14"/>', 26),
};

/* ---------- avvisi, fogli, attesa ---------- */
function toast(msg, type = '') {
  const t = h('div', { class: 'toast ' + type, text: msg }); $('#toasts').append(t);
  setTimeout(() => t.remove(), type === 'err' ? 7000 : 3800);
}
let sheetOnClose = null;
function closeSheet() { $('#sheetBack').hidden = true; const f = sheetOnClose; sheetOnClose = null; if (f) f(); }
function sheet(title, body, buttons = [], onClose = null) {
  if (!$('#sheetBack').hidden) closeSheet();
  $('#sheetTitle').textContent = title;
  const sb = $('#sheetBody'); sb.innerHTML = ''; typeof body === 'string' ? (sb.innerHTML = body) : sb.append(body);
  sb.scrollTop = 0;
  const sf = $('#sheetFoot'); sf.innerHTML = '';
  buttons.forEach((b) => sf.append(h('button', { class: 'btn ' + (b.cls || ''), text: b.label, onclick: () => { if (b.onClick && b.onClick() === false) return; sheetOnClose = null; $('#sheetBack').hidden = true; } })));
  sheetOnClose = onClose;
  $('#sheetBack').hidden = false;
}
$('#sheetClose').onclick = closeSheet;
$('#sheetBack').addEventListener('click', (e) => { if (e.target.id === 'sheetBack') closeSheet(); });

C.setAskPassword((name, wrong) => new Promise((resolve) => {
  let done = false; const fin = (v) => { if (!done) { done = true; resolve(v); } };
  const inp = h('input', { type: 'password', placeholder: 'Password del documento', autocomplete: 'off', style: { width: '100%', padding: '12px', border: '1px solid var(--line)', borderRadius: '11px', fontSize: '16px' } });
  inp.addEventListener('keydown', (e) => { if (e.key === 'Enter') { sheetOnClose = null; $('#sheetBack').hidden = true; fin(inp.value); } });
  busy.pause();
  sheet('Password richiesta', h('div', {},
    h('p', { html: `Il file <b>${esc(name)}</b> è protetto da password.` }),
    wrong ? h('div', { class: 'notice warn', text: 'Password errata, riprova.' }) : null, inp,
    h('p', { style: { fontSize: '12.5px', color: 'var(--muted)' }, text: 'La password resta solo in memoria finché l\'app è aperta.' })),
  [{ label: 'Annulla', cls: 'ghost', onClick: () => { busy.resume(); fin(null); } }, { label: 'Sblocca', onClick: () => { busy.resume(); fin(inp.value); } }],
  () => { busy.resume(); fin(null); });
  setTimeout(() => inp.focus(), 250);
}));

let wakeLock = null;
const busy = {
  on: false,
  async show(msg) {
    this.on = true; $('#busy').hidden = false; this.set(0, msg);
    try { if (navigator.wakeLock) wakeLock = await navigator.wakeLock.request('screen'); } catch (e) {}
  },
  set(f, msg) { $('#busyBar').style.width = Math.round(Math.max(0, Math.min(1, f)) * 100) + '%'; if (msg) $('#busyMsg').textContent = msg; },
  hide() { this.on = false; $('#busy').hidden = true; try { wakeLock && wakeLock.release(); } catch (e) {} wakeLock = null; },
  pause() { if (this.on) $('#busy').hidden = true; },
  resume() { if (this.on) $('#busy').hidden = false; },
};

/* ---------- condividi, salva, anteprima ---------- */
const urls = [];
const urlOf = (blob) => { const u = URL.createObjectURL(blob); urls.push(u); return u; };
const mimeByName = (n) => /\.pdf$/i.test(n) ? 'application/pdf' : /\.png$/i.test(n) ? 'image/png' : /\.webp$/i.test(n) ? 'image/webp' : /\.jpe?g$/i.test(n) ? 'image/jpeg' : /\.zip$/i.test(n) ? 'application/zip' : 'application/octet-stream';
const asFile = (r) => r.file || (r.file = new File([r.blob], r.name, { type: r.blob.type || mimeByName(r.name) }));
function canShare(files) { try { return !!(navigator.canShare && navigator.share && navigator.canShare({ files })); } catch (e) { return false; } }
function download(blob, name) { const a = h('a', { href: urlOf(blob), download: name }); document.body.append(a); a.click(); a.remove(); }
function share(results) {
  const files = results.map(asFile); // preparati subito: la condivisione deve partire dentro il tocco
  if (canShare(files)) {
    navigator.share({ files }).catch((e) => { if (e && e.name !== 'AbortError') { toast('Condivisione non riuscita, salvo il file.', 'err'); files.forEach((f) => download(f, f.name)); } });
  } else files.forEach((f) => download(f, f.name));
}
async function preview(r) {
  const box = h('div', { class: 'viewer' });
  sheet(r.name, box, [{ label: isIOS ? 'Condividi / Salva' : 'Condividi', onClick: () => { share([r]); } }]);
  if (/^image\//.test(r.blob.type) || /\.(jpe?g|png|webp)$/i.test(r.name)) { box.append(h('img', { src: urlOf(r.blob), alt: '' })); return; }
  try {
    const b = new Uint8Array(await r.blob.arrayBuffer()); const pdf = await C.openPdfJs(b, r.name);
    const max = Math.min(pdf.numPages, 40); const W = Math.min(window.innerWidth - 32, 700) * Math.min(2, window.devicePixelRatio || 1);
    box.append(h('div', { class: 'empty', text: pdf.numPages + (pdf.numPages === 1 ? ' pagina' : ' pagine') + (pdf.numPages > max ? ` · anteprima delle prime ${max}` : '') }));
    for (let i = 1; i <= max; i++) {
      if ($('#sheetBack').hidden) break;
      const pg = await pdf.getPage(i); const s = W / pg.getViewport({ scale: 1 }).width;
      const rr = await C.renderPage(pdf, i, s); const blob = await C.toBlob(rr.canvas, 'image/jpeg', 0.85); C.freeCanvas(rr.canvas);
      box.append(h('img', { src: urlOf(blob), alt: 'Pagina ' + i }));
    }
    pdf.destroy();
  } catch (e) { box.append(h('div', { class: 'notice warn', text: 'Anteprima non disponibile: ' + e.message })); }
}

/* ---------- selezione file ---------- */
const ACCEPT = { pdf: 'application/pdf,.pdf', image: 'image/*' };
function pickFiles(accept, multiple) {
  return new Promise((resolve) => {
    const inp = h('input', { type: 'file', multiple: multiple || null, accept: accept.map((k) => ACCEPT[k]).join(','), style: { position: 'fixed', left: '-1000px', opacity: '0' } });
    document.body.append(inp);
    inp.addEventListener('change', () => { const fs = [...inp.files]; inp.remove(); resolve(fs); });
    inp.click();
  });
}
const HEIC_MSG = (n) => `«${n}» è in formato HEIC e questo telefono non sa leggerlo. Imposta la fotocamera per salvare in JPG (Samsung: Fotocamera › Impostazioni › Formati › disattiva «Immagini ad alta efficienza»).`;
async function normalize(files, accept) {
  const out = []; const bad = [];
  for (const f of files) {
    const k = C.kind(f);
    if (k === 'heic' && accept.includes('image')) {
      try { // iPhone recenti sanno leggere HEIC: lo converto in JPG
        const bmp = await C.decodeImage(f); const c = C.drawScaled(bmp, bmp.width, bmp.height, '#ffffff'); C.freeCanvas(bmp);
        const b = await C.toBlob(c, 'image/jpeg', 0.92); C.freeCanvas(c);
        out.push(new File([b], C.base(f.name) + '.jpg', { type: 'image/jpeg' }));
      } catch (e) { toast(HEIC_MSG(f.name), 'err'); }
      continue;
    }
    (accept.includes(k) ? out : bad).push(f);
  }
  if (bad.length) toast(`${bad.length} file non adatti a questo strumento: ${bad.map((f) => f.name).slice(0, 2).join(', ')}${bad.length > 2 ? '…' : ''}`, 'err');
  return out;
}

/* ======================================================================
   STRUMENTI
   ====================================================================== */
const resultPdf = (bytes, name, orig, note) => ({ blob: C.pdfBlob(bytes), name, orig, note });
const TOOLS = [
{ id: 'comprimi-pdf', group: 'Comprimi', icon: 'pdfz', title: 'Comprimi PDF', short: 'Scansioni e documenti più leggeri', accept: ['pdf'], multiple: true, cta: 'Comprimi',
  intro: 'Riduci il peso dei PDF per email, WhatsApp e portali.',
  options: [
    { id: 'mode', type: 'seg', label: 'Modalità', value: 'smart', choices: [['smart', 'Intelligente'], ['max', 'Massima']],
      helps: { smart: 'Ricomprime solo le immagini: il testo resta selezionabile.', max: 'Le pagine diventano immagini: file più leggero, testo non selezionabile.' } },
    { id: 'level', type: 'seg', label: 'Livello', value: 'media', choices: [['alta', 'Alta qualità'], ['media', 'Bilanciato'], ['forte', 'Forte']],
      helps: { alta: 'Circa 200 dpi · riduzione moderata.', media: 'Circa 150 dpi · ideale per email e portali.', forte: 'Circa 110 dpi · massimo risparmio, leggibile a schermo.' } },
    { id: 'stripMeta', type: 'toggle', label: 'Rimuovi metadati (autore, programma, date)', value: true, adv: true },
  ],
  async run(files, o, progress) {
    const pr = C.PRESETS[o.level] || C.PRESETS.media; const out = [];
    for (let i = 0; i < files.length; i++) {
      const f = files[i]; const b = await C.bytesOf(f);
      const sub = (x, m) => progress((i + x) / files.length, (files.length > 1 ? `[${i + 1}/${files.length}] ` : '') + m);
      if (o.mode === 'max') {
        const r = await C.rasterizePdf(b, f.name, { dpi: pr.dpi, q: pr.rq }, sub);
        if (r.length >= b.length) out.push({ blob: f, name: f.name, orig: b.length, note: 'Il file è già più leggero della versione a immagini: tenuto l\'originale.' });
        else out.push(resultPdf(r, C.base(f.name) + '_compresso.pdf', b.length, `Pagine convertite in immagini a ${pr.dpi} dpi`));
      } else {
        const r = await C.compressSmart(b, f.name, { maxPx: pr.maxPx, q: pr.q, stripMeta: o.stripMeta }, sub); const st = r.stats;
        if (r.bytes.length >= b.length * 0.98) out.push({ blob: f, name: f.name, orig: b.length, note: 'Nessuna riduzione significativa: il PDF è già leggero o contiene quasi solo testo. Prova «Massima» se serve un file più piccolo.' });
        else out.push(resultPdf(r.bytes, C.base(f.name) + '_compresso.pdf', b.length, st.images ? `${st.done} immagini ricompresse su ${st.images}` : 'Struttura del file ottimizzata'));
      }
    }
    return out;
  } },
{ id: 'comprimi-foto', group: 'Comprimi', icon: 'imgz', title: 'Comprimi foto', short: 'Riduci peso e dimensioni', accept: ['image'], multiple: true, cta: 'Comprimi',
  intro: 'Riduci peso e dimensioni delle foto. GPS e dati della fotocamera vengono eliminati.',
  options: [
    { id: 'size', type: 'seg', label: 'Dimensioni', value: '1920', choices: [['0', 'Originali'], ['2560', 'Grandi'], ['1920', 'Medie'], ['1280', 'Piccole']],
      helps: { 0: 'Dimensioni invariate, riduce solo il peso.', 2560: 'Lato lungo 2560 px · ottima qualità anche stampata.', 1920: 'Lato lungo 1920 px · ideale per email e WhatsApp.', 1280: 'Lato lungo 1280 px · il più leggero.' } },
    { id: 'quality', type: 'range', label: 'Qualità', min: 40, max: 100, value: 80, unit: '%' },
    { id: 'format', type: 'select', label: 'Formato', value: 'orig', adv: true, choices: () => [['orig', 'Stesso formato'], ['jpg', 'JPG'], ['png', 'PNG (senza perdita)']].concat(C.canEncode('image/webp') ? [['webp', 'WebP']] : []) },
    { id: 'maxKB', type: 'number', label: 'Peso massimo per foto (KB)', value: 0, min: 0, adv: true, help: '0 = nessun limite. Utile per i portali con un limite di caricamento.' },
  ],
  async run(files, o, progress) {
    const out = [];
    for (let i = 0; i < files.length; i++) {
      const f = files[i]; progress(i / files.length, 'Foto ' + (i + 1) + ' di ' + files.length);
      const r = await C.processImage(f, { format: o.format, quality: +o.quality, resize: o.size === '0' ? 'none' : 'px', px: +o.size, maxKB: +o.maxKB, suffix: '_ridotta' });
      let note = r.note; if (+o.maxKB > 0 && r.blob.size > o.maxKB * 1024) note += ' · non è stato possibile scendere sotto il limite';
      out.push({ blob: r.blob, name: r.name, orig: f.size, note }); await C.tick();
    }
    return out;
  } },
{ id: 'unisci-pdf', group: 'Unisci', icon: 'merge', title: 'Unisci in un PDF', short: 'PDF e foto in un unico file', accept: ['pdf', 'image'], multiple: true, reorder: true, cta: 'Unisci',
  intro: 'Metti insieme PDF e foto in un solo PDF, nell\'ordine che scegli con le frecce.',
  options: [
    { id: 'name', type: 'text', label: 'Nome del file', value: 'documento_unito' },
    { id: 'pageSize', type: 'seg', label: 'Pagine delle foto', value: 'A4', choices: [['A4', 'Formato A4'], ['image', 'Come la foto']], helps: { A4: 'Ogni foto è adattata a una pagina A4, pronta da stampare.', image: 'Ogni pagina ha le dimensioni della foto.' } },
    { id: 'optimize', type: 'toggle', label: 'Alleggerisci le foto (consigliato)', value: true },
    { id: 'margin', type: 'select', label: 'Margine', value: '0', adv: true, choices: [['0', 'Nessuno'], ['5', '5 mm'], ['10', '10 mm'], ['20', '20 mm']] },
    { id: 'orientation', type: 'select', label: 'Orientamento A4', value: 'auto', adv: true, choices: [['auto', 'Automatico'], ['portrait', 'Verticale'], ['landscape', 'Orizzontale']] },
  ],
  async run(files, o, progress) {
    const tot = files.reduce((a, f) => a + f.size, 0);
    const bytes = await C.mergeToPdf(files, { pageSize: o.pageSize, orientation: o.orientation, margin: +o.margin, optimize: o.optimize, maxPx: 2200, quality: 0.85 }, progress);
    return [resultPdf(bytes, (o.name || 'documento_unito').replace(/\.pdf$/i, '') + '.pdf', tot, files.length + ' file uniti')];
  } },
{ id: 'unisci-foto', group: 'Unisci', icon: 'collage', title: 'Unisci foto in una', short: 'Es. fronte e retro di un documento', accept: ['image'], multiple: true, reorder: true, preview: true, cta: 'Unisci',
  intro: 'Affianca o impila più foto in un\'unica immagine.',
  options: [
    { id: 'layout', type: 'seg', label: 'Disposizione', value: 'v', choices: [['v', 'In colonna'], ['h', 'In riga'], ['g', 'Griglia']] },
    { id: 'cols', type: 'number', label: 'Colonne', value: 2, min: 1, max: 6, showIf: (o) => o.layout === 'g' },
    { id: 'uniform', type: 'select', label: 'Dimensioni', value: 'min', adv: true, choices: [['min', 'Uniforma alla più piccola'], ['max', 'Uniforma alla più grande'], ['none', 'Lascia originali']] },
    { id: 'gap', type: 'range', label: 'Spaziatura', min: 0, max: 60, value: 0, unit: ' px', adv: true },
    { id: 'bg', type: 'select', label: 'Sfondo', value: '#ffffff', adv: true, choices: [['#ffffff', 'Bianco'], ['#000000', 'Nero'], ['transparent', 'Trasparente (solo PNG)']] },
    { id: 'format', type: 'seg', label: 'Formato', value: 'jpg', adv: true, choices: [['jpg', 'JPG'], ['png', 'PNG']] },
    { id: 'quality', type: 'range', label: 'Qualità', min: 50, max: 100, value: 88, unit: '%', adv: true, showIf: (o) => o.format !== 'png' },
    { id: 'name', type: 'text', label: 'Nome del file', value: 'foto_unite', adv: true },
  ],
  async compose(files, o, cap) {
    const bmps = []; for (const f of files) bmps.push(await bitmapOf(f));
    const bg = (o.bg === 'transparent' && o.format === 'jpg') ? '#ffffff' : o.bg;
    return C.composeImages(bmps, { layout: o.layout, cols: +o.cols, uniform: o.uniform, gap: +o.gap, bg, maxPx: 4000 }, cap);
  },
  async run(files, o, progress) {
    progress(0.3, 'Compongo l\'immagine');
    const c = await this.compose(files, o);
    const blob = await C.toBlob(c, C.mimeOf(o.format), o.format === 'png' ? undefined : o.quality / 100);
    const note = `${c.width}×${c.height} px · ${files.length} foto`; C.freeCanvas(c);
    return [{ blob, name: (o.name || 'foto_unite') + '.' + o.format, orig: files.reduce((a, f) => a + f.size, 0), note }];
  } },
{ id: 'pagine', group: 'Pagine PDF', icon: 'pages', title: 'Pagine PDF', short: 'Estrai, dividi, ruota, elimina e riordina le pagine', accept: ['pdf'], multiple: true, custom: true, wide: true },
{ id: 'metadati', group: 'Privacy', icon: 'meta', title: 'Rimuovi metadati', short: 'GPS, fotocamera, autore', accept: ['pdf', 'image'], multiple: true, showMeta: true, cta: 'Pulisci',
  intro: 'Togli posizione GPS, modello del telefono, autore e programma da foto e PDF. Le foto JPG e PNG non vengono ricompresse: qualità identica.',
  options: [],
  async run(files, o, progress) {
    const out = [];
    for (let i = 0; i < files.length; i++) {
      const f = files[i]; progress(i / files.length, f.name); const b = await C.bytesOf(f); const k = C.kind(f);
      if (k === 'pdf') {
        const { doc } = await C.loadPdf(b, f.name); const found = Object.keys(C.pdfInfo(doc)); C.stripPdfMetadata(doc);
        out.push(resultPdf(await C.save(doc), C.base(f.name) + '_pulito.pdf', b.length, found.length ? 'Rimossi: ' + found.join(', ') : 'Nessun metadato trovato'));
      } else if (b[0] === 0xFF && b[1] === 0xD8) {
        const m = C.jpegMeta(b);
        out.push({ blob: new Blob([C.jpegStrip(b, m.orientation)], { type: 'image/jpeg' }), name: C.base(f.name) + '_pulita.jpg', orig: b.length, note: (m.gps ? 'Posizione GPS rimossa · ' : '') + 'dati della fotocamera rimossi' });
      } else if (b[0] === 0x89 && b[1] === 0x50) {
        out.push({ blob: new Blob([C.pngStrip(b)], { type: 'image/png' }), name: C.base(f.name) + '_pulita.png', orig: b.length, note: 'Dati incorporati rimossi' });
      } else {
        const r = await C.processImage(f, { format: 'orig', quality: 92, resize: 'none', suffix: '_pulita' });
        out.push({ blob: r.blob, name: r.name, orig: b.length, note: 'Ricodificata senza metadati' });
      }
    }
    return out;
  } },
{ id: 'password', group: 'Privacy', icon: 'lock', title: 'Password PDF', short: 'Proteggi o sblocca un PDF', accept: ['pdf'], multiple: true, cta: 'Applica',
  intro: 'Cifratura AES-256: senza password il contenuto non è leggibile. Comunica la password su un canale diverso (es. SMS o telefonata).',
  options: [
    { id: 'action', type: 'seg', label: 'Operazione', value: 'protect', choices: [['protect', 'Proteggi'], ['unlock', 'Togli password']], helps: { protect: 'Se dimentichi la password il file non è recuperabile.', unlock: 'Serve conoscere la password attuale: la chiedo all\'avvio.' } },
    { id: 'user', type: 'password', label: 'Password per aprire il file', value: '', remember: false, showIf: (o) => o.action === 'protect' },
    { id: 'user2', type: 'password', label: 'Ripeti la password', value: '', remember: false, showIf: (o) => o.action === 'protect' },
    { id: 'print', type: 'toggle', label: 'Consenti la stampa', value: true, showIf: (o) => o.action === 'protect' },
    { id: 'copy', type: 'toggle', label: 'Consenti di copiare il testo', value: false, showIf: (o) => o.action === 'protect' },
    { id: 'modify', type: 'toggle', label: 'Consenti modifiche', value: false, adv: true, showIf: (o) => o.action === 'protect' },
    { id: 'owner', type: 'password', label: 'Password proprietario (facoltativa)', value: '', remember: false, adv: true, help: 'Serve a cambiare i permessi. Se vuota ne genero una casuale.', showIf: (o) => o.action === 'protect' },
  ],
  validate(files, o) {
    if (o.action === 'protect') { if (!o.user || o.user.length < 6) return 'Usa una password di almeno 6 caratteri.'; if (o.user !== o.user2) return 'Le due password non coincidono.'; }
  },
  ctaFor: (o) => o.action === 'protect' ? 'Proteggi' : 'Togli password',
  async run(files, o, progress) {
    const out = [];
    for (const f of files) {
      progress(0.4, f.name); const b = await C.bytesOf(f);
      if (o.action === 'protect') { const r = await C.protectPdf(b, f.name, o); out.push(resultPdf(r.bytes, C.base(f.name) + '_protetto.pdf', b.length, 'AES-256 · stampa ' + (o.print ? 'sì' : 'no') + ' · copia ' + (o.copy ? 'sì' : 'no'))); }
      else { const r = await C.unlockPdf(b, f.name); out.push(resultPdf(r.bytes, C.base(f.name) + '_sbloccato.pdf', b.length, r.encrypted ? 'Password rimossa' : 'Il file non era protetto')); }
    }
    return out;
  } },
];
const GROUPS = ['Comprimi', 'Unisci', 'Pagine PDF', 'Privacy'];
const bmCache = new WeakMap();
function bitmapOf(f) { if (!bmCache.has(f)) bmCache.set(f, C.decodeImage(f)); return bmCache.get(f); }

/* ======================================================================
   NAVIGAZIONE
   ====================================================================== */
function setBar(title, back) {
  $('#barText').textContent = title; $('#back').hidden = !back; $('#barLogo').hidden = back;
}
$('#back').onclick = () => { if (history.state && history.state.t) history.back(); else renderHome(); };
window.addEventListener('popstate', (e) => {
  if (busy.on) { history.pushState(e.state || {}, ''); return; } // durante l'elaborazione non si esce
  if (!$('#sheetBack').hidden) closeSheet();
  if (e.state && e.state.t) openTool(e.state.t, false); else renderHome(false);
});
function clearBar() { bar.innerHTML = ''; bar.hidden = true; }

/* ======================================================================
   HOME
   ====================================================================== */
let deferredInstall = null;
window.addEventListener('beforeinstallprompt', (e) => { e.preventDefault(); deferredInstall = e; const b = $('#installBox'); if (b) renderHome(false); });
function installBox() {
  if (isStandalone() || store.get('installDismissed')) return null;
  const close = h('button', { class: 'close', 'aria-label': 'Chiudi', text: '×', onclick: () => { store.set('installDismissed', true); box.remove(); } });
  let content;
  if (isIOS) content = h('div', { class: 'grow', html: `<b>Installala come app</b><br>Tocca <span class="share-ico">${ICON.share}</span> <b>Condividi</b> in Safari, poi <b>«Aggiungi alla schermata Home»</b>. Da lì funziona anche senza rete.` });
  else if (deferredInstall) content = h('div', { class: 'grow' }, h('b', { text: 'Installala come app' }), h('div', { text: 'Avrai l\'icona sulla Home e funzionerà anche senza rete.', style: { margin: '2px 0 8px' } }),
    h('button', { class: 'btn sm', text: 'Installa', onclick: async () => { deferredInstall.prompt(); try { await deferredInstall.userChoice; } catch (e) {} deferredInstall = null; renderHome(false); } }));
  else content = h('div', { class: 'grow', html: '<b>Installala come app</b><br>Apri il menu <b>⋮</b> del browser e scegli <b>«Installa app»</b> o <b>«Aggiungi a schermata Home»</b>.' });
  const box = h('div', { class: 'install', id: 'installBox' }, content, close);
  return box;
}
function statusLine() {
  const el = h('div', { class: 'status', id: 'status' }, h('span', { class: 'dot' }), h('span', { id: 'statusText', text: 'I file restano sul telefono · nessun invio a server' }));
  updateStatus(el); return el;
}
function updateStatus(el = $('#status')) {
  if (!el) return; const t = el.querySelector('#statusText');
  if (offlineReady) { el.classList.add('ok'); t.textContent = 'Pronta anche offline · i file restano sul telefono'; }
  else if (!('serviceWorker' in navigator) || location.protocol === 'file:') t.textContent = 'I file restano sul telefono · uso offline non disponibile qui';
  else t.textContent = 'Preparo l\'uso offline… · i file restano sul telefono';
}
function renderHome(push = true) {
  if (push && history.state && history.state.t) { history.back(); return; }
  clearBar(); setBar('Officina Documenti', false); app.innerHTML = ''; window.scrollTo(0, 0);
  app.append(statusLine());
  const ib = installBox(); if (ib) app.append(ib);
  for (const g of GROUPS) {
    app.append(h('div', { class: 'gtitle', text: g }));
    const tiles = h('div', { class: 'tiles' });
    for (const t of TOOLS.filter((x) => x.group === g)) {
      const tile = t.wide
        ? h('button', { class: 'tile wide', onclick: () => openTool(t.id) }, h('div', { class: 'ic', html: ICON[t.icon] }), h('div', { class: 'txt' }, h('b', { text: t.title }), h('small', { text: t.short })))
        : h('button', { class: 'tile', onclick: () => openTool(t.id) }, h('div', { class: 'ic', html: ICON[t.icon] }), h('b', { text: t.title }), h('small', { text: t.short }));
      tiles.append(tile);
    }
    app.append(tiles);
  }
  app.append(h('div', { class: 'foot', text: `Officina Documenti mobile ${CFG.version || ''} · elaborazione sul dispositivo · pdf-lib, pdf.js, JSZip (open source)` }));
}

/* ======================================================================
   SCHERMATA STRUMENTO
   ====================================================================== */
function loadOpts(t) {
  const saved = store.get('opts.' + t.id) || {}; const o = {};
  for (const d of t.options || []) o[d.id] = (d.remember !== false && saved[d.id] !== undefined) ? saved[d.id] : d.value;
  if (o.format === 'webp' && !C.canEncode('image/webp')) o.format = 'orig';
  return o;
}
function saveOpts(t, o) { const s = {}; for (const d of t.options || []) if (d.remember !== false) s[d.id] = o[d.id]; store.set('opts.' + t.id, s); }
function optionsForm(defs, opts, onChange) {
  const main = h('div'), adv = h('div'); const rows = [];
  for (const d of defs) {
    const row = h('div', { class: 'opt' });
    const set = (v) => { opts[d.id] = v; onChange && onChange(d.id); refresh(); };
    if (d.type !== 'toggle') row.append(h('label', { class: 'l', text: d.label }));
    if (d.type === 'seg') {
      const seg = h('div', { class: 'seg' }); const help = h('div', { class: 'seg-help' });
      const paint = () => { seg.querySelectorAll('button').forEach((b) => b.classList.toggle('on', b.dataset.v === String(opts[d.id]))); help.textContent = (d.helps && d.helps[opts[d.id]]) || ''; };
      for (const [v, l] of d.choices) seg.append(h('button', { type: 'button', 'data-v': v, text: l, onclick: () => { set(v); paint(); } }));
      paint(); row.append(seg); if (d.helps) row.append(help);
    } else if (d.type === 'select') {
      const ch = typeof d.choices === 'function' ? d.choices() : d.choices;
      const s = h('select', {}, ch.map(([v, l]) => h('option', { value: v, text: l, selected: String(opts[d.id]) === String(v) })));
      s.onchange = () => set(s.value); row.append(s);
    } else if (d.type === 'range') {
      const out = h('output', { text: opts[d.id] + (d.unit || '') });
      const r = h('input', { type: 'range', min: d.min, max: d.max, value: opts[d.id] });
      r.oninput = () => { out.textContent = r.value + (d.unit || ''); opts[d.id] = +r.value; };
      r.onchange = () => set(+r.value);
      row.append(h('div', { class: 'range' }, r, out));
    } else if (d.type === 'toggle') {
      const c = h('input', { type: 'checkbox', checked: !!opts[d.id] }); c.onchange = () => set(c.checked);
      row.append(h('label', { class: 'toggle' }, h('span', { text: d.label }), c));
    } else if (d.type === 'password') {
      const i = h('input', { type: 'password', value: opts[d.id] || '', autocomplete: 'new-password' });
      i.oninput = () => { opts[d.id] = i.value; };
      row.append(h('div', { class: 'pw' }, i, h('button', { class: 'ib', type: 'button', text: '👁', 'aria-label': 'Mostra o nascondi', onclick: () => { i.type = i.type === 'password' ? 'text' : 'password'; } })));
    } else {
      const i = h('input', { type: d.type === 'number' ? 'number' : 'text', value: opts[d.id], min: d.min, max: d.max, inputmode: d.type === 'number' ? 'numeric' : null });
      i.oninput = () => { opts[d.id] = d.type === 'number' ? (i.value === '' ? 0 : +i.value) : i.value; };
      i.onchange = () => set(opts[d.id]);
      row.append(i);
    }
    if (d.help) row.append(h('div', { class: 'help', text: d.help }));
    rows.push([d, row]); (d.adv ? adv : main).append(row);
  }
  function refresh() { for (const [d, row] of rows) row.hidden = !!(d.showIf && !d.showIf(opts)); }
  refresh();
  const wrap = h('div', {}, main);
  if (adv.childNodes.length) wrap.append(h('details', { class: 'adv' }, h('summary', { text: 'Altre opzioni' }), adv));
  return wrap;
}

const descCache = new WeakMap();
async function describe(f, th, info, extra, t) {
  const k = C.kind(f);
  try {
    if (k === 'image') {
      const u = urlOf(f); th.style.backgroundImage = `url("${u}")`; th.textContent = '';
      const im = await new Promise((res, rej) => { const i = new Image(); i.onload = () => res(i); i.onerror = rej; i.src = u; });
      info.textContent = `${C.fmt(f.size)} · ${im.naturalWidth}×${im.naturalHeight} px`;
      if (t.showMeta) {
        const b = await C.bytesOf(f); let list = [];
        if (b[0] === 0xFF && b[1] === 0xD8) { const m = C.jpegMeta(b); list = Object.entries(m.fields).map(([a, v]) => a + (v === 'presente' ? '' : ': ' + v)); if (m.xmp) list.push('XMP'); }
        else if (b[0] === 0x89) list = [...new Set(C.pngMeta(b).chunks.map((c) => ({ tEXt: 'testi incorporati', zTXt: 'testi incorporati', iTXt: 'testi incorporati', eXIf: 'EXIF', tIME: 'data modifica' })[c] || c))];
        extra.append(list.length ? h('div', { class: 'warn', text: 'Trovati: ' + list.join(' · ') }) : h('div', { class: 'ok', text: 'Nessun metadato rilevante' }));
      }
    } else if (k === 'pdf') {
      let d = descCache.get(f);
      if (!d) {
        const b = await C.bytesOf(f); const doc = await C.PDFDocument.load(b, { ignoreEncryption: true, updateMetadata: false });
        d = { pages: doc.getPageCount(), enc: doc.isEncrypted, sig: C.hasSignature(b, doc), info: doc.isEncrypted ? {} : C.pdfInfo(doc) }; descCache.set(f, d);
      }
      info.textContent = `${C.fmt(f.size)} · ${d.pages} ${d.pages === 1 ? 'pagina' : 'pagine'}`;
      if (d.enc) extra.append(h('div', { class: 'ok', text: '🔒 protetto da password' }));
      if (d.sig) extra.append(h('div', { class: 'warn', text: '⚠ Firmato digitalmente: modificarlo invalida la firma.' }));
      if (t.showMeta) { const list = Object.entries(d.info).map(([a, v]) => `${a}: ${String(v).slice(0, 30)}`); extra.append(list.length ? h('div', { class: 'warn', text: 'Trovati: ' + list.join(' · ') }) : h('div', { class: 'ok', text: d.enc ? 'Visibili dopo lo sblocco' : 'Nessun metadato' })); }
      if (!d.enc) pdfThumb(f, th);
    }
  } catch (e) { info.textContent = C.fmt(f.size) + ' · ⚠ file non leggibile o danneggiato'; }
}
async function pdfThumb(blob, el) {
  try {
    const b = new Uint8Array(await blob.arrayBuffer()); const pdf = await C.openPdfJsQuiet(b); if (!pdf) { el.textContent = '🔒'; return; }
    const pg = await pdf.getPage(1); const s = 110 / pg.getViewport({ scale: 1 }).width;
    const r = await C.renderPage(pdf, 1, s); pdf.destroy();
    el.style.backgroundImage = `url("${urlOf(await C.toBlob(r.canvas, 'image/jpeg', 0.7))}")`; el.style.backgroundSize = 'contain'; el.textContent = ''; C.freeCanvas(r.canvas);
  } catch (e) {}
}

function resultsCard(list) {
  const tot = list.reduce((a, r) => a + r.blob.size, 0);
  const head = h('div', { class: 'res-head' }, h('h4', { text: `Risultato · ${list.length} ${list.length === 1 ? 'file' : 'file'} · ${C.fmt(tot)}` }));
  if (list.length > 1) head.append(h('button', { class: 'btn sm gold', html: ICON.share + ' Tutti', onclick: () => share(list) }));
  const card = h('div', { class: 'card', id: 'results' }, head);
  for (const r of list) {
    asFile(r);
    const th = h('div', { class: 'th', text: (C.ext(r.name) || '').toUpperCase().slice(0, 4) });
    let delta = null;
    if (r.orig) { const pct = Math.round((1 - r.blob.size / r.orig) * 100); if (pct > 0) delta = h('span', { class: 'delta pos', text: '−' + pct + '%' }); else if (pct < 0) delta = h('span', { class: 'delta neg', text: '+' + Math.abs(pct) + '%' }); }
    const isImg = /^image\//.test(r.blob.type) || /\.(jpe?g|png|webp)$/i.test(r.name);
    if (isImg) { th.style.backgroundImage = `url("${urlOf(r.blob)}")`; th.textContent = ''; }
    else if (/\.pdf$/i.test(r.name)) pdfThumb(r.blob, th);
    const acts = h('div', { class: 'acts' },
      h('button', { class: 'btn sm', html: ICON.share + (isIOS ? ' Condividi / Salva' : ' Condividi'), onclick: () => share([r]) }),
      h('button', { class: 'btn sm ghost', text: 'Anteprima', onclick: () => preview(r) }),
      isIOS ? null : h('button', { class: 'btn sm ghost', text: 'Salva', onclick: () => download(r.blob, r.name) }));
    card.append(h('div', { class: 'ritem' }, h('div', { class: 'top' }, th, h('div', { class: 'meta' }, h('div', { class: 'nm', text: r.name }),
      h('div', { class: 'info' }, (r.orig ? C.fmt(r.orig) + ' → ' : '') + C.fmt(r.blob.size), delta), r.note ? h('div', { class: 'info', text: r.note }) : null)), acts));
  }
  if (list.length > 1) card.append(h('button', { class: 'btn ghost sm', style: { width: '100%', marginTop: '4px' }, text: 'Salva tutti in un archivio ZIP', onclick: async () => { const z = await C.makeZip(list, 6); share([{ blob: z, name: 'risultati.zip' }]); } }));
  card.append(h('div', { class: 'help', style: { fontSize: '12.5px', color: 'var(--muted)', marginTop: '6px' }, text: isIOS ? 'Da «Condividi / Salva»: Salva su File, Mail, WhatsApp oppure Stampa.' : 'Da «Condividi»: WhatsApp, Gmail, Drive… «Salva» lo mette nei Download.' }));
  return card;
}
function showResults(slot, list) {
  slot.innerHTML = ''; slot.append(resultsCard(list));
  setTimeout(() => slot.scrollIntoView({ behavior: 'smooth', block: 'start' }), 60);
}

async function execute(fn, okMsg) {
  await busy.show('Avvio…'); await C.tick();
  try { const out = await fn((f, m) => busy.set(f, m)); busy.hide(); if (okMsg) toast(okMsg, 'ok'); return out; }
  catch (e) { busy.hide(); console.error(e); toast('Errore: ' + (e && e.message ? e.message : e), 'err'); return null; }
}

function openTool(id, push = true) {
  const t = TOOLS.find((x) => x.id === id); if (!t) return;
  if (push) history.pushState({ t: id }, '');
  setBar(t.title, true); app.innerHTML = ''; clearBar(); window.scrollTo(0, 0);
  if (t.custom) return pagesTool(t);
  const st = { files: [], opts: loadOpts(t) };
  const resSlot = h('div');
  const list = h('ul', { class: 'flist' }); const ltools = h('div', { class: 'ltools' });
  const prev = t.preview ? h('div', { class: 'stage' }, h('div', { class: 'empty', text: 'L\'anteprima comparirà qui' })) : null;
  const cta = h('button', { class: 'btn main', text: t.cta || 'Esegui' });
  const updCta = () => { cta.disabled = !st.files.length; cta.textContent = (t.ctaFor ? t.ctaFor(st.opts) : t.cta || 'Esegui') + (st.files.length > 1 ? ` (${st.files.length})` : ''); };
  let pt = null;
  const updatePreview = () => {
    if (!prev) return; clearTimeout(pt);
    pt = setTimeout(async () => {
      if (!st.files.length) { prev.innerHTML = ''; prev.append(h('div', { class: 'empty', text: 'L\'anteprima comparirà qui' })); return; }
      try { const c = await t.compose(st.files, st.opts, 900); prev.innerHTML = ''; prev.append(c); } catch (e) { prev.innerHTML = ''; prev.append(h('div', { class: 'empty', text: 'Anteprima non disponibile: ' + e.message })); }
    }, 200);
  };
  function render() {
    list.innerHTML = '';
    st.files.forEach((f, i) => {
      const th = h('div', { class: 'th', text: C.ext(f.name).toUpperCase().slice(0, 4) }); const info = h('div', { class: 'info', text: C.fmt(f.size) }); const extra = h('div');
      const acts = h('div', { class: 'acts' + (t.reorder ? '' : ' row') },
        t.reorder ? h('div', { class: 'acts row' },
          h('button', { class: 'ib', text: '↑', 'aria-label': 'Sposta su', disabled: i === 0, onclick: () => move(i, i - 1) }),
          h('button', { class: 'ib', text: '↓', 'aria-label': 'Sposta giù', disabled: i === st.files.length - 1, onclick: () => move(i, i + 1) })) : null,
        h('button', { class: 'ib del', text: '✕', 'aria-label': 'Rimuovi', onclick: () => { st.files.splice(i, 1); render(); } }));
      list.append(h('li', { class: 'fitem' }, th, h('div', { class: 'meta' }, h('div', { class: 'nm', text: (t.reorder ? (i + 1) + '. ' : '') + f.name }), info, extra), acts));
      describe(f, th, info, extra, t);
    });
    ltools.innerHTML = '';
    if (st.files.length) ltools.append(h('span', { text: `${st.files.length} file · ${C.fmt(st.files.reduce((a, f) => a + f.size, 0))}` }), h('button', { class: 'link', text: 'Svuota', onclick: () => { st.files = []; render(); } }));
    updCta(); updatePreview();
  }
  function move(a, b) { const [x] = st.files.splice(a, 1); st.files.splice(b, 0, x); render(); }
  const addLabel = t.accept.includes('pdf') && t.accept.includes('image') ? 'PDF o foto' : t.accept.includes('pdf') ? 'PDF' : 'foto';
  const add = h('button', { class: 'add' }, h('span', { html: ICON.add }), h('b', { text: st.files.length ? 'Aggiungi altri' : `Scegli ${addLabel}` }), h('small', { text: t.accept.includes('image') ? 'dalla Galleria, dalla fotocamera o da File' : 'da File, Download o Drive' }));
  add.onclick = async () => { const fs = await normalize(await pickFiles(t.accept, t.multiple), t.accept); if (fs.length) { st.files = t.multiple ? st.files.concat(fs) : fs.slice(0, 1); render(); } };
  app.append(h('p', { class: 'intro', text: t.intro || t.short }), resSlot,
    h('div', { class: 'card' }, h('h4', { text: 'File' }), add, list, ltools));
  if (prev) app.append(h('div', { class: 'card' }, h('h4', { text: 'Anteprima' }), prev));
  if (t.options && t.options.length) app.append(h('div', { class: 'card' }, h('h4', { text: 'Impostazioni' }), optionsForm(t.options, st.opts, () => { updCta(); updatePreview(); })));
  bar.append(h('div', { class: 'in' }, cta)); bar.hidden = false;
  cta.onclick = async () => {
    if (!st.files.length) return;
    const msg = t.validate && t.validate(st.files, st.opts); if (msg) return toast(msg, 'err');
    saveOpts(t, st.opts);
    const out = await execute((p) => t.run(st.files, st.opts, p), 'Fatto');
    if (out) showResults(resSlot, out);
  };
  render();
}

/* ======================================================================
   PAGINE PDF
   ====================================================================== */
function pagesTool(t) {
  const st = { docs: [], pages: [], mode: store.get('pagesMode') || 'all', ranges: '1-2, 3-', name: 'pagine' };
  const resSlot = h('div'); const grid = h('div', { class: 'pgrid' }); const count = h('div', { class: 'pcount' });
  const cta = h('button', { class: 'btn main', text: 'Crea PDF' });
  const tb = h('div', { class: 'ptool' });
  const sel = () => st.pages.filter((p) => p.sel);
  const need = () => { toast('Tocca prima le pagine da selezionare.'); return false; };
  function render() {
    grid.innerHTML = '';
    st.pages.forEach((p, i) => {
      const img = h('img', { src: p.url || 'data:image/gif;base64,R0lGODlhAQABAAAAACw=', alt: '', style: { transform: `rotate(${p.rot}deg)` } });
      const card = h('div', { class: 'pc' + (p.sel ? ' sel' : '') }, h('div', { class: 'pv' }, img), h('span', { class: 'n', text: i + 1 }), h('span', { class: 'ck', text: p.sel ? '✓' : '' }),
        h('div', { class: 'lb', text: st.docs.length > 1 ? `${st.docs[p.d].file.name} · p.${p.p + 1}` : `pag. originale ${p.p + 1}` }));
      card.onclick = () => { p.sel = !p.sel; card.classList.toggle('sel', p.sel); card.querySelector('.ck').textContent = p.sel ? '✓' : ''; upd(); };
      p.img = img; grid.append(card);
    });
    if (!st.pages.length) grid.append(h('div', { class: 'empty', style: { gridColumn: '1/-1' }, text: 'Aggiungi un PDF: vedrai qui le sue pagine.' }));
    upd();
  }
  function upd() {
    const s = sel().length; count.textContent = st.pages.length ? `${st.pages.length} pagine · ${s} selezionate · tocca una pagina per selezionarla` : '';
    tb.hidden = !st.pages.length;
    cta.disabled = !st.pages.length || ((st.mode === 'sel' || st.mode === 'each') && !s);
    cta.textContent = st.mode === 'each' ? `Crea ${s || ''} file` : st.mode === 'ranges' ? 'Dividi' : st.mode === 'sel' ? `Estrai ${s} pagine` : 'Crea PDF';
  }
  async function add() {
    const fs = await normalize(await pickFiles(['pdf'], true), ['pdf']); if (!fs.length) return;
    await execute(async (progress) => {
      for (const f of fs) {
        const b = await C.bytesOf(f); const { doc } = await C.loadPdf(b, f.name);
        if (C.hasSignature(b, doc)) toast(`«${f.name}» è firmato digitalmente: il nuovo PDF non conserverà la firma.`, 'err');
        const pdf = await C.openPdfJs(b, f.name); const di = st.docs.push({ file: f, doc }) - 1;
        const added = []; for (let i = 0; i < doc.getPageCount(); i++) { const p = { d: di, p: i, rot: 0, sel: false, url: null }; st.pages.push(p); added.push(p); }
        render();
        const W = 220;
        for (let i = 0; i < pdf.numPages; i++) {
          progress(i / pdf.numPages, `Miniature ${f.name}: ${i + 1} di ${pdf.numPages}`);
          const pg = await pdf.getPage(i + 1); const v = pg.getViewport({ scale: 1 }); const r = await C.renderPage(pdf, i + 1, W / Math.max(v.width, v.height));
          added[i].url = urlOf(await C.toBlob(r.canvas, 'image/jpeg', 0.75)); C.freeCanvas(r.canvas);
          if (added[i].img) added[i].img.src = added[i].url;
        }
        pdf.destroy();
      }
    });
    render();
  }
  const moveSel = (dir) => {
    const s = sel(); if (!s.length) return need();
    const P = st.pages;
    if (dir < 0) { for (let i = 1; i < P.length; i++) if (P[i].sel && !P[i - 1].sel) [P[i - 1], P[i]] = [P[i], P[i - 1]]; }
    else { for (let i = P.length - 2; i >= 0; i--) if (P[i].sel && !P[i + 1].sel) [P[i + 1], P[i]] = [P[i], P[i + 1]]; }
    render();
  };
  tb.append(
    h('button', { class: 'btn sm ghost', text: 'Tutte', onclick: () => { const all = sel().length < st.pages.length; st.pages.forEach((p) => p.sel = all); render(); } }),
    h('button', { class: 'btn sm ghost', text: '↻ Ruota', onclick: () => { const s = sel(); if (!s.length) return need(); s.forEach((p) => { p.rot = (p.rot + 90) % 360; p.img.style.transform = `rotate(${p.rot}deg)`; }); } }),
    h('button', { class: 'btn sm ghost', text: '◀ Sposta', onclick: () => moveSel(-1) }),
    h('button', { class: 'btn sm ghost', text: 'Sposta ▶', onclick: () => moveSel(1) }),
    h('button', { class: 'btn sm ghost', style: { color: 'var(--red)', borderColor: '#e7b4b4' }, text: '✕ Elimina', onclick: () => { const n = sel().length; if (!n) return need(); st.pages = st.pages.filter((p) => !p.sel); render(); toast(`${n} ${n === 1 ? 'pagina eliminata' : 'pagine eliminate'} · «Ripristina» per tornare indietro`); } }),
    h('button', { class: 'btn sm ghost', text: '↺ Ripristina', onclick: () => { st.pages = []; st.docs.forEach((d, di) => { for (let i = 0; i < d.doc.getPageCount(); i++) st.pages.push({ d: di, p: i, rot: 0, sel: false, url: thumbs.get(di + ':' + i) || null }); }); render(); toast('Pagine ripristinate come all\'origine'); } }));
  const thumbs = new Map(); // conserva le miniature anche delle pagine eliminate (per «Ripristina»)
  const remember = () => st.pages.forEach((p) => { if (p.url) thumbs.set(p.d + ':' + p.p, p.url); });
  const addBtn = h('button', { class: 'add' }, h('span', { html: ICON.add }), h('b', { text: 'Scegli uno o più PDF' }), h('small', { text: 'da File, Download o Drive' }));
  addBtn.onclick = async () => { await add(); remember(); };
  const modes = [['all', 'Tutte'], ['sel', 'Selezionate'], ['each', 'Una per file'], ['ranges', 'Intervalli']];
  const helps = { all: 'Un PDF con tutte le pagine nell\'ordine mostrato (comprese rotazioni ed eliminazioni).', sel: 'Un PDF con le sole pagine selezionate.', each: 'Ogni pagina selezionata diventa un file separato.', ranges: 'Ogni intervallo diventa un file. I numeri sono quelli blu sulle miniature.' };
  const rangesRow = h('div', { class: 'opt' }, h('label', { class: 'l', text: 'Intervalli' }), (() => { const i = h('input', { type: 'text', value: st.ranges, placeholder: 'es. 1-3, 4-6, 7-' }); i.oninput = () => { st.ranges = i.value; }; return i; })(), h('div', { class: 'help', text: 'Separa con la virgola. «7-» significa dalla 7 alla fine.' }));
  const nameIn = h('input', { type: 'text', value: st.name }); nameIn.oninput = () => { st.name = nameIn.value; };
  const seg = h('div', { class: 'seg' }); const segHelp = h('div', { class: 'seg-help' });
  const paint = () => { seg.querySelectorAll('button').forEach((b) => b.classList.toggle('on', b.dataset.v === st.mode)); segHelp.textContent = helps[st.mode]; rangesRow.hidden = st.mode !== 'ranges'; upd(); };
  modes.forEach(([v, l]) => seg.append(h('button', { type: 'button', 'data-v': v, text: l, onclick: () => { st.mode = v; store.set('pagesMode', v); paint(); } })));
  cta.onclick = async () => {
    const docs = st.docs.map((d) => d.doc); const nm = (st.name || 'pagine').replace(/\.pdf$/i, '');
    const it = (p) => ({ doc: p.d, page: p.p, rot: p.rot });
    const out = await execute(async (progress) => {
      const res = [];
      if (st.mode === 'all') res.push(resultPdf(await C.buildFromPages(docs, st.pages.map(it)), nm + '.pdf', null, st.pages.length + ' pagine'));
      else if (st.mode === 'sel') res.push(resultPdf(await C.buildFromPages(docs, sel().map(it)), nm + '_estratte.pdf', null, sel().length + ' pagine'));
      else if (st.mode === 'each') { const s = sel(); for (let i = 0; i < s.length; i++) { progress(i / s.length, 'File ' + (i + 1) + ' di ' + s.length); res.push(resultPdf(await C.buildFromPages(docs, [it(s[i])]), `${nm}_${st.pages.indexOf(s[i]) + 1}.pdf`, null, 'pagina ' + (st.pages.indexOf(s[i]) + 1))); } }
      else {
        const groups = C.parseRanges(st.ranges, st.pages.length);
        for (let g = 0; g < groups.length; g++) { progress(g / groups.length, 'File ' + (g + 1) + ' di ' + groups.length); const idx = groups[g]; const lab = idx.length === 1 ? 'p' + (idx[0] + 1) : 'p' + (idx[0] + 1) + '-' + (idx[idx.length - 1] + 1); res.push(resultPdf(await C.buildFromPages(docs, idx.map((k) => it(st.pages[k]))), `${nm}_${lab}.pdf`, null, idx.length + (idx.length === 1 ? ' pagina' : ' pagine'))); }
      }
      return res;
    }, 'Fatto');
    if (out) showResults(resSlot, out);
  };
  app.append(h('p', { class: 'intro', text: 'Tocca le pagine per selezionarle, poi usa i comandi qui sotto. Puoi aggiungere più PDF e combinarne le pagine.' }), resSlot,
    h('div', { class: 'card' }, addBtn), tb, count, grid,
    h('div', { class: 'card', style: { marginTop: '12px' } }, h('h4', { text: 'Cosa vuoi ottenere' }), h('div', { class: 'opt' }, seg, segHelp), rangesRow, h('div', { class: 'opt' }, h('label', { class: 'l', text: 'Nome del file' }), nameIn)));
  bar.append(h('div', { class: 'in' }, cta)); bar.hidden = false;
  paint(); render();
}

/* ======================================================================
   GUIDA
   ====================================================================== */
$('#help').onclick = () => sheet('Guida', `
<h4>Privacy</h4>
<ul><li>I file vengono elaborati <b>sul telefono</b>: non vengono caricati su nessun server.</li>
<li>L'app ha una regola di sicurezza che le <b>vieta di inviare dati</b> in rete.</li>
<li>Dopo la prima apertura funziona anche in <b>modalità aereo</b>: è la prova più semplice.</li>
<li>Le password restano solo in memoria e spariscono chiudendo l'app.</li></ul>
<h4>Salvare, inviare, stampare</h4>
<ul><li>${isIOS ? '<b>Condividi / Salva</b> apre il menu di iPhone: «Salva su File», Mail, WhatsApp, <b>Stampa</b>.' : '<b>Condividi</b> apre il menu di Android (WhatsApp, Gmail, Drive, Stampa dove disponibile); <b>Salva</b> mette il file nei Download.'}</li>
<li><b>Anteprima</b> mostra il risultato prima di inviarlo.</li></ul>
<h4>Da sapere</h4>
<ul><li><b>Firma digitale:</b> qualsiasi modifica a un PDF firmato invalida la firma. L'app lo segnala: invia l'originale quando serve la firma valida.</li>
<li><b>Compressione «Intelligente»:</b> lavora sulle immagini del PDF; su PDF di solo testo il guadagno è minimo.</li>
<li><b>Foto HEIC:</b> su iPhone vengono convertite in JPG in automatico.</li>
<li><b>Solo su PC</b> (versione completa): oscuramento dati, Word/Excel/PowerPoint, numeri di pagina, filigrana, PDF in immagini, ZIP.</li></ul>
<p style="color:var(--muted);font-size:12.5px">Versione ${esc(CFG.version || '')}</p>`, [{ label: 'Chiudi' }]);

/* ======================================================================
   USO OFFLINE (service worker)
   ====================================================================== */
let offlineReady = false;
if ('serviceWorker' in navigator && location.protocol !== 'file:') {
  navigator.serviceWorker.register('sw.js').then(() => navigator.serviceWorker.ready).then(() => {
    const check = () => { if (navigator.serviceWorker.controller) { offlineReady = true; updateStatus(); } };
    check(); navigator.serviceWorker.addEventListener('controllerchange', check);
  }).catch(() => {});
}
window.addEventListener('beforeunload', () => urls.forEach((u) => URL.revokeObjectURL(u)));
history.replaceState({}, '');
renderHome(false);
window.__officina = { TOOLS, openTool, renderHome };
})();
