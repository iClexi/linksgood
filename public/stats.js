const config = window.LINKSGOOD_STATS || {};
const title = document.getElementById('stats-title');
const summary = document.getElementById('stats-summary');
const visitsEl = document.getElementById('visits');

const escapeHtml = (value) => String(value ?? '')
  .replace(/&/g, '&amp;')
  .replace(/</g, '&lt;')
  .replace(/>/g, '&gt;')
  .replace(/"/g, '&quot;')
  .replace(/'/g, '&#39;');

const formatDate = (value) => new Date(value).toLocaleString();

const renderVisits = (visits) => {
  if (!visits.length) {
    visitsEl.innerHTML = '<p class="empty">Todavía no hay visitas consentidas.</p>';
    return;
  }
  visitsEl.innerHTML = `<table>
    <thead><tr><th>Fecha</th><th>IP</th><th>Navegador</th><th>Referrer</th><th>Datos</th></tr></thead>
    <tbody>${visits.map((visit) => {
      const browser = visit.browser || {};
      return `<tr>
        <td>${escapeHtml(formatDate(visit.visited_at))}</td>
        <td>${escapeHtml(visit.public_ip || visit.ip || '')}</td>
        <td>${escapeHtml((visit.user_agent || '').slice(0, 120))}</td>
        <td>${escapeHtml(visit.referer || '')}</td>
        <td>${escapeHtml([browser.timezone, browser.platform, browser.viewport ? `${browser.viewport.width}x${browser.viewport.height}` : ''].filter(Boolean).join(' · '))}</td>
      </tr>`;
    }).join('')}</tbody>
  </table>`;
};

const load = async () => {
  const response = await fetch(`/api/owner/${config.id}/${config.key}`, { credentials: 'same-origin' });
  const data = await response.json().catch(() => ({}));
  if (!response.ok) {
    title.textContent = 'No encontrado';
    visitsEl.innerHTML = '<p class="empty">No se pudo abrir esta actividad.</p>';
    return;
  }
  title.textContent = data.link.short_url;
  summary.innerHTML = `
    <div><strong>${data.link.clicks}</strong><span>visitas</span></div>
    <div><strong>${escapeHtml(data.link.target_host)}</strong><span>destino</span></div>
    <div><strong>${escapeHtml(data.link.mode)}</strong><span>modo</span></div>
  `;
  renderVisits(data.visits || []);
};

load();
