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
    visitsEl.innerHTML = '<p class="empty">Todavía no hay visitas registradas.</p>';
    return;
  }
  visitsEl.innerHTML = `<table>
    <thead><tr><th>Fecha</th><th>Origen</th><th>IP</th><th>Dispositivo</th><th>Navegador</th><th>Referrer</th></tr></thead>
    <tbody>${visits.map((visit) => {
      return `<tr>
        <td>${escapeHtml(formatDate(visit.visited_at))}</td>
        <td>${escapeHtml(visit.source === 'qr' ? 'QR' : 'Link')}</td>
        <td>${escapeHtml(visit.public_ip || visit.ip || '')}</td>
        <td>${escapeHtml(visit.device || '')}</td>
        <td>${escapeHtml((visit.user_agent || '').slice(0, 120))}</td>
        <td>${escapeHtml(visit.referer || '')}</td>
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
    <div><strong>${data.summary?.total ?? data.link.clicks}</strong><span>visitas</span></div>
    <div><strong>${data.summary?.qr ?? 0}</strong><span>desde QR</span></div>
    <div><strong>${escapeHtml(data.link.target_host)}</strong><span>destino</span></div>
    <div><strong><a href="${escapeHtml(data.link.qr_svg_url || '#')}" target="_blank" rel="noreferrer">QR SVG</a></strong><span>descarga</span></div>
  `;
  renderVisits(data.visits || []);
};

load();
