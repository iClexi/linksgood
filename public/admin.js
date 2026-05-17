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
    <div><strong>${data.counts.links}</strong><span>Enlaces</span></div>
    <div><strong>${data.counts.visits}</strong><span>Visitas</span></div>
    <div><strong>${data.counts.users}</strong><span>Usuarios</span></div>
  `;
  linksEl.innerHTML = table(['Creado', 'Alias', 'Usuario', 'Etiqueta', 'Destino', 'Clicks', 'IP creación'], data.links.map((link) => `
    <tr>
      <td data-label="Creado">${escapeHtml(formatDate(link.created_at))}</td>
      <td data-label="Alias">${escapeHtml(link.alias_path)}</td>
      <td data-label="Usuario">${escapeHtml(link.owner_username || 'anónimo')}</td>
      <td data-label="Etiqueta">${escapeHtml(link.owner_label || 'sin etiqueta')}</td>
      <td data-label="Destino">${escapeHtml(link.target_host)}</td>
      <td data-label="Clicks">${escapeHtml(link.clicks)}</td>
      <td data-label="IP creación">${escapeHtml(link.created_ip)}</td>
    </tr>
  `));
  visitsEl.innerHTML = table(['Fecha', 'Alias', 'Origen', 'Dueño', 'IP', 'Dispositivo', 'Navegador'], data.visits.map((visit) => `<tr>
      <td data-label="Fecha">${escapeHtml(formatDate(visit.visited_at))}</td>
      <td data-label="Alias">${escapeHtml(visit.alias_path)}</td>
      <td data-label="Origen">${escapeHtml(visit.source === 'qr' ? 'QR' : 'Link')}</td>
      <td data-label="Dueño">${escapeHtml(visit.owner_label || 'sin etiqueta')}</td>
      <td data-label="IP">${escapeHtml(visit.public_ip || visit.ip || '')}</td>
      <td data-label="Dispositivo">${escapeHtml(visit.device || '')}</td>
      <td data-label="Navegador">${escapeHtml((visit.user_agent || '').slice(0, 120))}</td>
    </tr>`));
};

load();
