import { animate, createTimeline, spring, stagger } from '/assets/anime.esm.min.js';

const config = window.LINKSGOOD_STATS || {};
const title = document.getElementById('stats-title');
const summary = document.getElementById('stats-summary');
const visitsEl = document.getElementById('visits');
const reduceMotion = window.matchMedia?.('(prefers-reduced-motion: reduce)').matches;

const escapeHtml = (value) => String(value ?? '')
  .replace(/&/g, '&amp;')
  .replace(/</g, '&lt;')
  .replace(/>/g, '&gt;')
  .replace(/"/g, '&quot;')
  .replace(/'/g, '&#39;');

const formatDate = (value) => new Date(value).toLocaleString();

const playInitialMotion = () => {
  if (reduceMotion) return;
  createTimeline({ defaults: { ease: 'outCubic' } })
    .add('.topbar.compact', {
      opacity: [0, 1],
      translateY: [-14, 0],
      duration: 420,
    }, 0)
    .add('.lead-panel', {
      opacity: [0, 1],
      translateY: [18, 0],
      scale: [0.985, 1],
      duration: 520,
    }, 90)
    .add('.dashboard .panel:not(.lead-panel)', {
      opacity: [0, 1],
      translateY: [22, 0],
      duration: 520,
      delay: stagger(55),
    }, 210);
};

const playLoadedMotion = () => {
  if (reduceMotion) return;
  animate('#stats-title', {
    opacity: [0.42, 1],
    translateY: [10, 0],
    duration: 360,
    ease: 'outCubic',
  });
  animate('#stats-summary .stat-card', {
    opacity: [0, 1],
    translateY: [16, 0],
    scale: [0.94, 1],
    duration: 520,
    delay: stagger(55),
    ease: spring({ bounce: 0.22, duration: 520 }),
  });
  animate('#stats-summary .stat-orbit', {
    rotate: [0, 360],
    duration: 3600,
    delay: stagger(180),
    loop: true,
    ease: 'linear',
  });
  animate('#visits table, #visits .empty', {
    opacity: [0, 1],
    translateY: [16, 0],
    duration: 440,
    ease: 'outCubic',
  });
  animate('#visits .visit-row', {
    opacity: [0, 1],
    translateX: [-14, 0],
    duration: 340,
    delay: stagger(24, { start: 90 }),
    ease: 'outCubic',
  });
  animate('#visits .source-pill', {
    scale: [0.86, 1],
    duration: 320,
    delay: stagger(26, { start: 160 }),
    ease: 'outBack',
  });
};

const renderVisits = (visits) => {
  if (!visits.length) {
    visitsEl.innerHTML = '<p class="empty activity-empty">Todavía no hay visitas registradas.</p>';
    return;
  }
  visitsEl.innerHTML = `<table>
    <thead><tr><th>Fecha</th><th>Origen</th><th>IP</th><th>Dispositivo</th><th>Navegador</th><th>Referrer</th></tr></thead>
    <tbody>${visits.map((visit) => {
      return `<tr>
        <td data-label="Fecha">${escapeHtml(formatDate(visit.visited_at))}</td>
        <td data-label="Origen"><span class="source-pill ${visit.source === 'qr' ? 'qr' : 'link'}">${escapeHtml(visit.source === 'qr' ? 'QR' : 'Link')}</span></td>
        <td data-label="IP">${escapeHtml(visit.public_ip || visit.ip || '')}</td>
        <td data-label="Dispositivo">${escapeHtml(visit.device || '')}</td>
        <td data-label="Navegador">${escapeHtml((visit.user_agent || '').slice(0, 120))}</td>
        <td data-label="Referrer">${escapeHtml(visit.referer || '')}</td>
      </tr>`.replace('<tr>', '<tr class="visit-row">');
    }).join('')}</tbody>
  </table>`;
};

const activityEndpoint = () => {
  if (config.account) return `/api/account/links/${encodeURIComponent(config.id)}/activity`;
  return `/api/owner/${encodeURIComponent(config.id)}/${encodeURIComponent(config.key)}`;
};

const load = async () => {
  const response = await fetch(activityEndpoint(), { credentials: 'same-origin' });
  const data = await response.json().catch(() => ({}));
  if (!response.ok) {
    title.textContent = 'No encontrado';
    visitsEl.innerHTML = '<p class="empty">No se pudo abrir esta actividad.</p>';
    playLoadedMotion();
    return;
  }
  title.textContent = data.link.short_url;
  summary.innerHTML = `
    <div class="stat-card"><i class="stat-orbit" aria-hidden="true"></i><strong>${data.summary?.total ?? data.link.clicks}</strong><span>Visitas</span></div>
    <div class="stat-card"><i class="stat-orbit" aria-hidden="true"></i><strong>${data.summary?.qr ?? 0}</strong><span>Desde QR</span></div>
    <div class="stat-card"><i class="stat-orbit" aria-hidden="true"></i><strong>${escapeHtml(data.link.target_host)}</strong><span>Destino</span></div>
    <div class="stat-card"><i class="stat-orbit" aria-hidden="true"></i><strong><a href="${escapeHtml(data.link.qr_svg_url || '#')}" target="_blank" rel="noreferrer">QR SVG</a></strong><span>Descarga</span></div>
  `;
  renderVisits(data.visits || []);
  requestAnimationFrame(playLoadedMotion);
};

playInitialMotion();
load();
