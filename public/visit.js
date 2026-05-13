const config = window.LINKSGOOD_VISIT || {};
const button = document.getElementById('continue');
const statusEl = document.getElementById('visit-status');

const browserData = () => ({
  userAgent: navigator.userAgent || '',
  language: navigator.language || '',
  languages: navigator.languages || [],
  platform: navigator.platform || '',
  vendor: navigator.vendor || '',
  cookieEnabled: Boolean(navigator.cookieEnabled),
  hardwareConcurrency: navigator.hardwareConcurrency || null,
  deviceMemory: navigator.deviceMemory || null,
  timezone: Intl.DateTimeFormat().resolvedOptions().timeZone || '',
  screen: {
    width: window.screen?.width || null,
    height: window.screen?.height || null,
    colorDepth: window.screen?.colorDepth || null,
    pixelRatio: window.devicePixelRatio || null,
  },
  viewport: {
    width: window.innerWidth || null,
    height: window.innerHeight || null,
  },
});

button?.addEventListener('click', async () => {
  button.disabled = true;
  statusEl.textContent = 'Registrando consentimiento...';
  try {
    const response = await fetch(`/api/visit/${config.id}`, {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      credentials: 'same-origin',
      body: JSON.stringify({ consent: true, browser: browserData() }),
    });
    const data = await response.json().catch(() => ({}));
    if (!response.ok || !data.redirect) throw new Error(data.error || 'No se pudo continuar.');
    window.location.href = data.redirect;
  } catch (error) {
    statusEl.textContent = error.message || 'No se pudo continuar.';
    button.disabled = false;
  }
});
