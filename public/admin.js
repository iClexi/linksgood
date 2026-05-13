const summary = document.getElementById('admin-summary');
const linksEl = document.getElementById('admin-links');
const visitsEl = document.getElementById('admin-visits');

const escapeHtml = (value) => String(value ?? '')
  .replace(/&/g, '&amp;')
  .replace(/</g, '&lt;')
  .replace(/>/g, '&gt;')
  .replace(/"/g, '&quot;')
  .replace(/'/g, '&#39;');

const formatDate = (value) => new Date(value).toLocaleString();

const table = (headers, rows) => `<table><thead><tr>${headers.map((h) => `<th>${h}</th>`).join('')}</tr></thead><tbody>${rows.join('')}</tbody></table>`;

const load = async () => {
  const response = await fetch('/api/admin/overview', { credentials: 'same-origin' });
  const data = await response.json().catch(() => ({}));
  if (!response.ok) {
    summary.innerHTML = '<div><strong>404</strong><span>No autorizado</span></div>';
    return;
  }
  summary.innerHTML = `
    <div><strong>${data.counts.links}</strong><span>enlaces</span></div>
    <div><strong>${data.counts.visits}</strong><span>visitas</span></div>
  `;
  linksEl.innerHTML = table(['Creado', 'Alias', 'Dueño', 'Destino', 'Clicks', 'IP creación'], data.links.map((link) => `
    <tr>
      <td>${escapeHtml(formatDate(link.created_at))}</td>
      <td>${escapeHtml(link.alias_path)}</td>
      <td>${escapeHtml(link.owner_label || 'sin etiqueta')}</td>
      <td>${escapeHtml(link.target_host)}</td>
      <td>${escapeHtml(link.clicks)}</td>
      <td>${escapeHtml(link.created_ip)}</td>
    </tr>
  `));
  visitsEl.innerHTML = table(['Fecha', 'Alias', 'Dueño', 'IP', 'Navegador', 'Datos'], data.visits.map((visit) => {
    const browser = visit.browser || {};
    return `<tr>
      <td>${escapeHtml(formatDate(visit.visited_at))}</td>
      <td>${escapeHtml(visit.alias_path)}</td>
      <td>${escapeHtml(visit.owner_label || 'sin etiqueta')}</td>
      <td>${escapeHtml(visit.public_ip || visit.ip || '')}</td>
      <td>${escapeHtml((visit.user_agent || '').slice(0, 120))}</td>
      <td>${escapeHtml([browser.timezone, browser.platform, browser.viewport ? `${browser.viewport.width}x${browser.viewport.height}` : ''].filter(Boolean).join(' · '))}</td>
    </tr>`;
  }));
};

load();
