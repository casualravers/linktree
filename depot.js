// Dépôt de doodles : mot, dessin ou photo envoyés vers Supabase Storage.
// Remplis DEPOT avec l'URL du projet et la clé anon (voir README, section « Dépôt de doodles »).
const DEPOT = {
  supabaseUrl: 'https://REMPLACER.supabase.co',
  anonKey: 'REMPLACER_PAR_LA_CLE_ANON',
  bucket: 'doodles',
};

const MAX_BYTES = 5 * 1024 * 1024;
const MAX_SIDE = 1600;
const ACCENT = '#e3a44e';

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
  const ctx = canvas.getContext('2d');
  let color = '#f2f2f2';
  let size = 10;
  let drawing = false;
  let last = null;
  let hasInk = false;

  function toCanvasPoint(e) {
    const r = canvas.getBoundingClientRect();
    return {
      x: (e.clientX - r.left) * (canvas.width / r.width),
      y: (e.clientY - r.top) * (canvas.height / r.height),
    };
  }

  canvas.addEventListener('pointerdown', (e) => {
    drawing = true;
    canvas.setPointerCapture(e.pointerId);
    last = toCanvasPoint(e);
    ctx.fillStyle = color;
    ctx.beginPath();
    ctx.arc(last.x, last.y, size / 2, 0, Math.PI * 2);
    ctx.fill();
    hasInk = true;
  });

  canvas.addEventListener('pointermove', (e) => {
    if (!drawing) return;
    const p = toCanvasPoint(e);
    ctx.strokeStyle = color;
    ctx.lineWidth = size;
    ctx.lineCap = 'round';
    ctx.lineJoin = 'round';
    ctx.beginPath();
    ctx.moveTo(last.x, last.y);
    ctx.lineTo(p.x, p.y);
    ctx.stroke();
    last = p;
  });

  const endStroke = () => { drawing = false; last = null; };
  canvas.addEventListener('pointerup', endStroke);
  canvas.addEventListener('pointercancel', endStroke);

  const swatches = document.querySelectorAll('.depot-swatch');
  swatches.forEach((btn) => {
    btn.addEventListener('click', () => {
      color = btn.dataset.color;
      swatches.forEach((b) => b.classList.toggle('is-active', b === btn));
    });
  });

  $('depot-size').addEventListener('input', (e) => { size = Number(e.target.value); });

  $('depot-clear').addEventListener('click', () => {
    ctx.clearRect(0, 0, canvas.width, canvas.height);
    hasInk = false;
  });

  // --- photo ---------------------------------------------------------
  const photoInput = $('depot-photo');
  const preview = $('depot-preview');
  let photoFile = null;
  let previewUrl = null;

  photoInput.addEventListener('change', () => {
    photoFile = photoInput.files[0] || null;
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
    ctx.clearRect(0, 0, canvas.width, canvas.height);
    hasInk = false;
    photoInput.value = '';
    photoFile = null;
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
        if (!hasInk) { setStatus('Dessine quelque chose d\'abord.', true); return; }
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
