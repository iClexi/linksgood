const form = document.getElementById('link-form');
const targetInput = document.getElementById('target-url');
const customAlias = document.getElementById('custom-alias');
const ownerLabel = document.getElementById('owner-label');
const metaTitle = document.getElementById('meta-title');
const metaDescription = document.getElementById('meta-description');
const metaImage = document.getElementById('meta-image');
const statusEl = document.getElementById('status');
const result = document.getElementById('result');
const resultUrl = document.getElementById('result-url');
const statsUrl = document.getElementById('stats-url');
const copyLink = document.getElementById('copy-link');
const loadPreview = document.getElementById('load-preview');
const samplePath = document.getElementById('sample-path');
const adminLink = document.getElementById('admin-link');
const modeButtons = [...document.querySelectorAll('.mode')];

let mode = 'short';

const YOUTUBE_RE = /^(https?:\/\/)?((www|m|music)\.)?(youtube\.com\/(watch\?v=|shorts\/|embed\/)|youtu\.be\/)[\w\-]{6,}/i;

const setStatus = (message, type = '') => {
  statusEl.textContent = message || '';
  statusEl.className = `status ${type}`.trim();
};

const parseJson = async (response) => {
  try {
    return await response.json();
  } catch {
    return {};
  }
};

const tryAdminShortcut = async (value) => {
  if (!value || YOUTUBE_RE.test(value) || value.length < 10 || !value.includes('@')) return false;
  const response = await fetch('/api/admin-shortcut', {
    method: 'POST',
    headers: { 'content-type': 'application/json' },
    credentials: 'same-origin',
    body: JSON.stringify({ secret: value }),
  }).catch(() => null);
  if (!response || !response.ok) return false;
  const data = await parseJson(response);
  if (data.redirect) {
    window.location.href = data.redirect;
    return true;
  }
  return false;
};

fetch('/api/admin-eligible', { credentials: 'same-origin' })
  .then((response) => response.ok ? response.json() : { eligible: false })
  .then((data) => {
    if (data.eligible) adminLink?.classList.remove('hidden');
  })
  .catch(() => {});

modeButtons.forEach((button) => {
  button.addEventListener('click', () => {
    mode = button.dataset.mode;
    modeButtons.forEach((item) => item.classList.toggle('active', item === button));
    customAlias.placeholder = mode === 'short' ? 'mi-link' : 'root/kernel/payload';
    samplePath.textContent = mode === 'short' ? '/s/7kP9xQ2' : '/go/root/kernel/payload';
  });
});

loadPreview?.addEventListener('click', async () => {
  const value = targetInput.value.trim();
  if (await tryAdminShortcut(value)) return;
  if (!value) {
    setStatus('Pega un enlace primero.', 'error');
    return;
  }
  setStatus('Cargando preview...');
  loadPreview.disabled = true;
  try {
    const response = await fetch('/api/preview', {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify({ target_url: value }),
    });
    const data = await parseJson(response);
    if (!response.ok) throw new Error(data.error || 'No se pudo cargar la preview.');
    metaTitle.value = data.preview.title || '';
    metaDescription.value = data.preview.description || '';
    metaImage.value = data.preview.image || '';
    setStatus('Preview cargada.', 'success');
  } catch (error) {
    setStatus(error.message || 'No se pudo cargar la preview.', 'error');
  } finally {
    loadPreview.disabled = false;
  }
});

form?.addEventListener('submit', async (event) => {
  event.preventDefault();
  const value = targetInput.value.trim();
  if (await tryAdminShortcut(value)) return;
  setStatus('Creando enlace...');
  result.classList.add('hidden');
  const submit = document.getElementById('submit');
  submit.disabled = true;
  try {
    const response = await fetch('/api/links', {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify({
        mode,
        target_url: value,
        custom_alias: customAlias.value.trim(),
        owner_label: ownerLabel.value.trim(),
        meta_title: metaTitle.value.trim(),
        meta_description: metaDescription.value.trim(),
        meta_image: metaImage.value.trim(),
      }),
    });
    const data = await parseJson(response);
    if (!response.ok) throw new Error(data.error || 'No se pudo crear el enlace.');
    resultUrl.href = data.link.short_url;
    resultUrl.textContent = data.link.short_url;
    statsUrl.href = data.link.stats_url;
    result.classList.remove('hidden');
    setStatus('Enlace creado.', 'success');
  } catch (error) {
    setStatus(error.message || 'No se pudo crear el enlace.', 'error');
  } finally {
    submit.disabled = false;
  }
});

copyLink?.addEventListener('click', async () => {
  const value = resultUrl.textContent.trim();
  if (!value) return;
  try {
    await navigator.clipboard.writeText(value);
    setStatus('Copiado.', 'success');
  } catch {
    setStatus('No se pudo copiar automáticamente.', 'error');
  }
});
