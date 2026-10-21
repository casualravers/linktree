// Dépôt de doodles : mot, dessin ou photo envoyés vers Supabase Storage.
// Remplis DEPOT avec l'URL du projet et la clé anon (voir README, section « Dépôt de doodles »).
const DEPOT = {
  supabaseUrl: 'https://mlqerniqtkjfcijizswy.supabase.co',
  anonKey: 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6Im1scWVybmlxdGtqZmNpaml6c3d5Iiwicm9sZSI6ImFub24iLCJpYXQiOjE3OTI0MTAwNjYsImV4cCI6MjEwNzk4NjA2Nn0.6JL9jUEvQQQzhjgO1Cx1K1YBz5cLNZU4jStuRmDOKfI',
  bucket: 'doodles',
};

const MAX_BYTES = 5 * 1024 * 1024;
const MAX_SIDE = 1600;
const ACCENT = '#e3a44e';
// Chaque entree d'historique est une image complete du canvas (environ 2,5 Mo) : on limite pour les telephones.
const HISTORY_MAX = 20;

(function () {
  const $ = (id) => document.getElementById(id);
  const section = document.querySelector('.depot');
  const submit = $('depot-submit');
  const status = $('depot-status');
  const configured = !DEPOT.anonKey.startsWith('REMPLACER');

  // Tant que Supabase n'est pas branché, la section reste cachée pour les visiteurs.
  if (!configured) {
    section.hidden = true;
    console.warn('Dépôt de doodles : renseigne DEPOT dans depot.js pour l\'activer.');
    return;
  }

  function setStatus(msg, isError) {
    status.textContent = msg;
    status.classList.toggle('is-error', Boolean(isError));
  }

  function toBlob(cnv, type, quality) {
    return new Promise((resolve, reject) => {
      cnv.toBlob((b) => (b ? resolve(b) : reject(new Error('encodage'))), type, quality);
    });
  }

  // --- onglets -------------------------------------------------------
  let tab = 'mot';
  const tabs = document.querySelectorAll('.depot-tab');
  const panels = document.querySelectorAll('.depot-panel');

  tabs.forEach((btn) => {
    btn.addEventListener('click', () => {
      tab = btn.dataset.tab;
      tabs.forEach((b) => b.setAttribute('aria-selected', String(b === btn)));
      panels.forEach((p) => { p.hidden = p.dataset.panel !== tab; });
      setStatus('');
    });
  });

  // --- dessin --------------------------------------------------------
  const canvas = $('depot-canvas');
  // willReadFrequently : l'annulation relit souvent les pixels du canvas.
  const ctx = canvas.getContext('2d', { willReadFrequently: true });
  const cursor = $('depot-cursor');
  const W = canvas.width;
  const H = canvas.height;

  let tool = 'pen';        // pen | eraser | line | rect | circle | spray | sticker
  let symmetry = 'none';   // none | h | v | quad
  let sticker = '★';
  let color = '#f2f2f2';
  let size = 10;
  let drawing = false;
  let start = null;        // point de depart (formes)
  let last = null;         // dernier point reçu
  let mid = null;          // point milieu, pour lisser le trait
  let base = null;         // image avant le trait en cours (apercu des formes)
  let sprayTimer = null;

  const undoStack = [];
  const redoStack = [];
  const undoBtn = $('depot-undo');
  const redoBtn = $('depot-redo');

  function updateHistoryButtons() {
    undoBtn.disabled = undoStack.length === 0;
    redoBtn.disabled = redoStack.length === 0;
  }

  function takeSnapshot() {
    return ctx.getImageData(0, 0, W, H);
  }

  // A appeler avant chaque trait : l'etat precedent devient annulable.
  function pushHistory() {
    undoStack.push(takeSnapshot());
    if (undoStack.length > HISTORY_MAX) undoStack.shift();
    redoStack.length = 0;
    updateHistoryButtons();
  }

  function undo() {
    if (!undoStack.length) return;
    redoStack.push(takeSnapshot());
    ctx.putImageData(undoStack.pop(), 0, 0);
    updateHistoryButtons();
  }

  function redo() {
    if (!redoStack.length) return;
    undoStack.push(takeSnapshot());
    ctx.putImageData(redoStack.pop(), 0, 0);
    updateHistoryButtons();
  }

  undoBtn.addEventListener('click', undo);
  redoBtn.addEventListener('click', redo);

  document.addEventListener('keydown', (e) => {
    if (tab !== 'dessin' || !(e.ctrlKey || e.metaKey)) return;
    const k = e.key.toLowerCase();
    if (k === 'z' && !e.shiftKey) { e.preventDefault(); undo(); }
    else if (k === 'y' || (k === 'z' && e.shiftKey)) { e.preventDefault(); redo(); }
  });

  function canvasHasInk() {
    const d = ctx.getImageData(0, 0, W, H).data;
    for (let i = 3; i < d.length; i += 4) {
      if (d[i]) return true;
    }
    return false;
  }

  function toCanvasPoint(e) {
    const r = canvas.getBoundingClientRect();
    return {
      x: (e.clientX - r.left) * (W / r.width),
      y: (e.clientY - r.top) * (H / r.height),
    };
  }

  // Miroirs de symetrie : chaque trait est rejoue sur ces transformations.
  function symTransforms() {
    const id = (p) => p;
    const h = (p) => ({ x: W - p.x, y: p.y });
    const v = (p) => ({ x: p.x, y: H - p.y });
    const hv = (p) => ({ x: W - p.x, y: H - p.y });
    if (symmetry === 'h') return [id, h];
    if (symmetry === 'v') return [id, v];
    if (symmetry === 'quad') return [id, h, v, hv];
    return [id];
  }

  function withSymmetry(fn) {
    symTransforms().forEach((t) => fn(t));
  }

  function setupStroke() {
    ctx.lineCap = 'round';
    ctx.lineJoin = 'round';
    ctx.lineWidth = size;
    ctx.strokeStyle = color;
    ctx.fillStyle = color;
    ctx.globalCompositeOperation = tool === 'eraser' ? 'destination-out' : 'source-over';
  }

  function resetComposite() {
    ctx.globalCompositeOperation = 'source-over';
  }

  function drawDot(p) {
    withSymmetry((t) => {
      const q = t(p);
      ctx.beginPath();
      ctx.arc(q.x, q.y, size / 2, 0, Math.PI * 2);
      ctx.fill();
    });
  }

  // Segment lisse : courbe quadratique de a a b, avec c comme point de controle.
  function drawSmooth(a, c, b) {
    withSymmetry((t) => {
      const p0 = t(a);
      const p1 = t(c);
      const p2 = t(b);
      ctx.beginPath();
      ctx.moveTo(p0.x, p0.y);
      ctx.quadraticCurveTo(p1.x, p1.y, p2.x, p2.y);
      ctx.stroke();
    });
  }

  function drawShape(a, b) {
    ctx.putImageData(base, 0, 0);
    setupStroke();
    withSymmetry((t) => {
      const p0 = t(a);
      const p1 = t(b);
      ctx.beginPath();
      if (tool === 'line') {
        ctx.moveTo(p0.x, p0.y);
        ctx.lineTo(p1.x, p1.y);
      } else if (tool === 'rect') {
        ctx.rect(Math.min(p0.x, p1.x), Math.min(p0.y, p1.y), Math.abs(p1.x - p0.x), Math.abs(p1.y - p0.y));
      } else {
        ctx.arc(p0.x, p0.y, Math.hypot(p1.x - p0.x, p1.y - p0.y), 0, Math.PI * 2);
      }
      ctx.stroke();
    });
  }

  function placeSticker(p) {
    ctx.font = `${20 + size * 4}px "Archivo Black", "Segoe UI Symbol", sans-serif`;
    ctx.textAlign = 'center';
    ctx.textBaseline = 'middle';
    ctx.fillStyle = color;
    ctx.globalCompositeOperation = 'source-over';
    withSymmetry((t) => {
      const q = t(p);
      ctx.fillText(sticker, q.x, q.y);
    });
  }

  function sprayAt(p) {
    const radius = size * 2;
    ctx.fillStyle = color;
    ctx.globalCompositeOperation = 'source-over';
    withSymmetry((t) => {
      const q = t(p);
      for (let i = 0; i < 20; i++) {
        const a = Math.random() * Math.PI * 2;
        const r = Math.sqrt(Math.random()) * radius;
        ctx.fillRect(q.x + Math.cos(a) * r, q.y + Math.sin(a) * r, 2, 2);
      }
    });
  }

  function stopSpray() {
    clearInterval(sprayTimer);
    sprayTimer = null;
  }

  // Curseur de taille : cercle a l'echelle de l'affichage (pas du canvas interne).
  function showCursor(e) {
    if (!['pen', 'eraser', 'spray'].includes(tool)) {
      cursor.hidden = true;
      return;
    }
    const r = canvas.getBoundingClientRect();
    const stage = canvas.parentElement.getBoundingClientRect();
    const d = (tool === 'spray' ? size * 4 : size) * (r.width / W);
    cursor.hidden = false;
    cursor.style.width = `${d}px`;
    cursor.style.height = `${d}px`;
    cursor.style.left = `${e.clientX - stage.left}px`;
    cursor.style.top = `${e.clientY - stage.top}px`;
  }

  canvas.addEventListener('pointerdown', (e) => {
    const p = toCanvasPoint(e);
    canvas.setPointerCapture(e.pointerId);
    showCursor(e);
    pushHistory();
    setupStroke();

    if (tool === 'sticker') {
      placeSticker(p);
      resetComposite();
      return;
    }

    drawing = true;
    start = p;
    last = p;
    mid = p;
    base = undoStack[undoStack.length - 1];

    if (tool === 'pen' || tool === 'eraser') drawDot(p);
    if (tool === 'spray') {
      sprayAt(p);
      sprayTimer = setInterval(() => sprayAt(last), 30);
    }
  });

  canvas.addEventListener('pointermove', (e) => {
    showCursor(e);
    if (!drawing) return;
    const p = toCanvasPoint(e);

    if (tool === 'pen' || tool === 'eraser') {
      const m = { x: (last.x + p.x) / 2, y: (last.y + p.y) / 2 };
      setupStroke();
      drawSmooth(mid, last, m);
      mid = m;
      last = p;
    } else if (tool === 'spray') {
      last = p;
    } else {
      drawShape(start, p);
      last = p;
    }
  });

  function endStroke(e) {
    if (!drawing) return;
    drawing = false;
    stopSpray();
    if (tool === 'pen' || tool === 'eraser') {
      setupStroke();
      drawSmooth(mid, last, last);
    } else if (tool === 'line' || tool === 'rect' || tool === 'circle') {
      drawShape(start, toCanvasPoint(e));
    }
    resetComposite();
  }

  canvas.addEventListener('pointerup', endStroke);
  canvas.addEventListener('pointercancel', endStroke);
  canvas.addEventListener('pointerleave', () => { cursor.hidden = true; });

  // --- outils, stickers, couleurs, symetrie --------------------------
  const toolButtons = document.querySelectorAll('.depot-tool');
  const stickerButtons = document.querySelectorAll('.depot-sticker');

  function setTool(name) {
    tool = name;
    toolButtons.forEach((b) => b.setAttribute('aria-pressed', String(b.dataset.tool === name)));
    stickerButtons.forEach((b) => b.classList.remove('is-active'));
    cursor.hidden = true;
  }

  toolButtons.forEach((btn) => {
    btn.addEventListener('click', () => setTool(btn.dataset.tool));
  });

  stickerButtons.forEach((btn) => {
    btn.addEventListener('click', () => {
      sticker = btn.dataset.glyph;
      setTool('sticker');
      btn.classList.add('is-active');
    });
  });

  const swatches = document.querySelectorAll('.depot-swatch');
  const colorInput = $('depot-color');

  swatches.forEach((btn) => {
    btn.addEventListener('click', () => {
      color = btn.dataset.color;
      colorInput.value = color;
      swatches.forEach((b) => b.classList.toggle('is-active', b === btn));
    });
  });

  colorInput.addEventListener('input', (e) => {
    color = e.target.value;
    swatches.forEach((b) => b.classList.remove('is-active'));
  });

  $('depot-sym').addEventListener('change', (e) => { symmetry = e.target.value; });

  $('depot-size').addEventListener('input', (e) => { size = Number(e.target.value); });

  $('depot-clear').addEventListener('click', () => {
    if (!canvasHasInk()) return;
    pushHistory();
    ctx.clearRect(0, 0, W, H);
  });

  updateHistoryButtons();

  // --- photo ---------------------------------------------------------
  const photoInput = $('depot-photo');
  const preview = $('depot-preview');
  let photoFile = null;
  let previewUrl = null;

  photoInput.addEventListener('change', () => {
    photoFile = photoInput.files[0] || null;
    $('depot-photo-name').textContent = photoFile ? photoFile.name : 'Aucun fichier';
    if (previewUrl) URL.revokeObjectURL(previewUrl);
    previewUrl = photoFile ? URL.createObjectURL(photoFile) : null;
    preview.src = previewUrl || '';
    preview.hidden = !photoFile;
  });

  async function resizePhoto(file) {
    const url = URL.createObjectURL(file);
    try {
      const img = new Image();
      img.src = url;
      await img.decode();
      const scale = Math.min(1, MAX_SIDE / Math.max(img.naturalWidth, img.naturalHeight));
      const off = document.createElement('canvas');
      off.width = Math.round(img.naturalWidth * scale);
      off.height = Math.round(img.naturalHeight * scale);
      off.getContext('2d').drawImage(img, 0, 0, off.width, off.height);
      return await toBlob(off, 'image/jpeg', 0.9);
    } finally {
      URL.revokeObjectURL(url);
    }
  }

  // --- mot -----------------------------------------------------------
  async function renderWord(text) {
    const family = '"Archivo Black", Impact, sans-serif';
    await document.fonts.load(`bold 200px "Archivo Black"`);
    const measure = document.createElement('canvas').getContext('2d');
    let fontSize = 240;
    measure.font = `${fontSize}px ${family}`;
    const maxW = 1200;
    const w0 = measure.measureText(text).width;
    if (w0 > maxW) fontSize = Math.floor(fontSize * maxW / w0);

    measure.font = `${fontSize}px ${family}`;
    const pad = 40;
    const off = document.createElement('canvas');
    off.width = Math.ceil(measure.measureText(text).width + pad * 2);
    off.height = Math.ceil(fontSize * 1.4 + pad * 2);
    const d = off.getContext('2d');
    d.font = `${fontSize}px ${family}`;
    d.fillStyle = ACCENT;
    d.textBaseline = 'middle';
    d.fillText(text, pad, off.height / 2);
    return toBlob(off, 'image/png');
  }

  // --- envoi ---------------------------------------------------------
  async function upload(blob, ext) {
    if (blob.size > MAX_BYTES) throw new Error('fichier trop lourd');
    const name = `${Date.now()}-${Math.random().toString(36).slice(2, 8)}.${ext}`;
    const res = await fetch(`${DEPOT.supabaseUrl}/storage/v1/object/${DEPOT.bucket}/${name}`, {
      method: 'POST',
      headers: {
        Authorization: `Bearer ${DEPOT.anonKey}`,
        apikey: DEPOT.anonKey,
        'Content-Type': blob.type,
        'Cache-Control': 'max-age=3600',
      },
      body: blob,
    });
    if (!res.ok) throw new Error(`HTTP ${res.status}`);
  }

  function reset() {
    $('depot-mot').value = '';
    ctx.clearRect(0, 0, W, H);
    undoStack.length = 0;
    redoStack.length = 0;
    updateHistoryButtons();
    photoInput.value = '';
    photoFile = null;
    $('depot-photo-name').textContent = 'Aucun fichier';
    preview.hidden = true;
    if (previewUrl) { URL.revokeObjectURL(previewUrl); previewUrl = null; }
  }

  submit.addEventListener('click', async () => {
    let blob;
    let ext;
    try {
      if (tab === 'mot') {
        const text = $('depot-mot').value.trim();
        if (!text) { setStatus('Écris un mot d\'abord.', true); return; }
        blob = await renderWord(text);
        ext = 'png';
      } else if (tab === 'dessin') {
        if (!canvasHasInk()) { setStatus('Dessine quelque chose d\'abord.', true); return; }
        blob = await toBlob(canvas, 'image/png');
        ext = 'png';
      } else {
        if (!photoFile) { setStatus('Choisis une photo.', true); return; }
        blob = await resizePhoto(photoFile);
        ext = 'jpg';
      }
    } catch (err) {
      setStatus('Impossible de préparer ce fichier. Essaie une autre image.', true);
      return;
    }

    submit.disabled = true;
    setStatus('Envoi en cours…');
    try {
      await upload(blob, ext);
      setStatus('Reçu ! Ça arrive bientôt à l\'écran.');
      reset();
    } catch (err) {
      setStatus('Échec de l\'envoi. Réessaie dans un instant.', true);
    } finally {
      submit.disabled = false;
    }
  });
})();
