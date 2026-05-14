import React, { useEffect, useMemo, useState } from 'react';
import { createRoot } from 'react-dom/client';
import {
  ArrowRight,
  BarChart3,
  Copy,
  ExternalLink,
  Link2,
  LockKeyhole,
  ScanSearch,
  Sparkles,
} from 'lucide-react';
import './styles.css';

const YOUTUBE_RE = /^(https?:\/\/)?((www|m|music)\.)?(youtube\.com\/(watch\?v=|shorts\/|embed\/)|youtu\.be\/)[\w-]{6,}/i;

const parseJson = async (response) => {
  try {
    return await response.json();
  } catch {
    return {};
  }
};

const displayHost = (value) => {
  const raw = value.trim();
  if (!raw) return 'sin destino';
  try {
    const url = new URL(raw.includes('://') ? raw : `https://${raw}`);
    return url.hostname.replace(/^www\./, '') || 'sin destino';
  } catch {
    return 'url pendiente';
  }
};

const safeImageUrl = (value) => {
  const raw = value.trim();
  if (!raw) return '';
  try {
    const url = new URL(raw);
    if (!['http:', 'https:'].includes(url.protocol)) return '';
    return url.href;
  } catch {
    return '';
  }
};

function App() {
  const [mode, setMode] = useState('short');
  const [targetUrl, setTargetUrl] = useState('');
  const [customAlias, setCustomAlias] = useState('');
  const [ownerLabel, setOwnerLabel] = useState('');
  const [metaTitle, setMetaTitle] = useState('');
  const [metaDescription, setMetaDescription] = useState('');
  const [metaImage, setMetaImage] = useState('');
  const [status, setStatus] = useState({ message: '', type: '' });
  const [result, setResult] = useState(null);
  const [adminEligible, setAdminEligible] = useState(false);
  const [busy, setBusy] = useState(false);
  const [previewBusy, setPreviewBusy] = useState(false);
  const [copied, setCopied] = useState(false);

  const aliasPath = useMemo(() => {
    const alias = customAlias.trim().replace(/^\/+/, '').replace(/\/+$/, '');
    if (!alias) return mode === 'short' ? '/s/9Kx2' : '/go/root/kernel/payload';
    return `${mode === 'short' ? '/s' : '/go'}/${alias}`;
  }, [customAlias, mode]);

  const host = useMemo(() => displayHost(targetUrl), [targetUrl]);
  const socialTitle = metaTitle.trim() || 'Preview social editable';
  const socialDescription = metaDescription.trim() || 'Titulo, descripcion e imagen definidos por el creador.';
  const socialImage = safeImageUrl(metaImage);

  useEffect(() => {
    fetch('/api/admin-eligible', { credentials: 'same-origin' })
      .then((response) => response.ok ? response.json() : { eligible: false })
      .then((data) => setAdminEligible(Boolean(data.eligible)))
      .catch(() => {});
  }, []);

  const setMessage = (message, type = '') => setStatus({ message, type });

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

  const loadPreview = async () => {
    const value = targetUrl.trim();
    if (await tryAdminShortcut(value)) return;
    if (!value) {
      setMessage('Pega un enlace primero.', 'error');
      return;
    }

    setPreviewBusy(true);
    setMessage('Detectando preview...');
    try {
      const response = await fetch('/api/preview', {
        method: 'POST',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify({ target_url: value }),
      });
      const data = await parseJson(response);
      if (!response.ok) throw new Error(data.error || 'No se pudo cargar la preview.');
      setMetaTitle(data.preview.title || '');
      setMetaDescription(data.preview.description || '');
      setMetaImage(data.preview.image || '');
      setMessage('Preview lista.', 'success');
    } catch (error) {
      setMessage(error.message || 'No se pudo cargar la preview.', 'error');
    } finally {
      setPreviewBusy(false);
    }
  };

  const createLink = async (event) => {
    event.preventDefault();
    const value = targetUrl.trim();
    if (await tryAdminShortcut(value)) return;

    setBusy(true);
    setResult(null);
    setMessage('Generando...');
    try {
      const response = await fetch('/api/links', {
        method: 'POST',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify({
          mode,
          target_url: value,
          custom_alias: customAlias.trim(),
          owner_label: ownerLabel.trim(),
          meta_title: metaTitle.trim(),
          meta_description: metaDescription.trim(),
          meta_image: metaImage.trim(),
        }),
      });
      const data = await parseJson(response);
      if (!response.ok) throw new Error(data.error || 'No se pudo crear el enlace.');
      setResult(data.link);
      setMessage('Enlace creado.', 'success');
    } catch (error) {
      setMessage(error.message || 'No se pudo crear el enlace.', 'error');
    } finally {
      setBusy(false);
    }
  };

  const copyResult = async () => {
    if (!result?.short_url) return;
    try {
      await navigator.clipboard.writeText(result.short_url);
      setCopied(true);
      setMessage('Copiado.', 'success');
      setTimeout(() => setCopied(false), 1300);
    } catch {
      setMessage('No se pudo copiar automaticamente.', 'error');
    }
  };

  return (
    <div className="app-shell">
      <aside className="rail" aria-label="Navegacion principal">
        <a className="brand" href="/" aria-label="Linksgood inicio">
          <span className="brand-mark">LG</span>
          <span>
            <strong>Linksgood</strong>
            <small>links.iclexi.tech</small>
          </span>
        </a>

        <nav className="rail-nav">
          <a href="/terminos">Terminos</a>
          <a href="/privacidad">Privacidad</a>
          {adminEligible ? <a id="admin-link" href="/admin">Admin</a> : null}
        </nav>

        <div className="rail-status">
          <LockKeyhole aria-hidden="true" size={18} />
          <span>Redirect directo</span>
        </div>
      </aside>

      <main className="desk">
        <section className="compose" aria-label="Crear enlace">
          <div className="desk-heading">
            <span>Crear enlace</span>
            <h1>Acorta o alarga links.</h1>
          </div>

          <form id="link-form" className="builder" onSubmit={createLink} data-state={status.type || (status.message ? 'busy' : 'idle')}>
            <label className="target-field">
              <span>Destino</span>
              <div className="target-control">
                <Link2 aria-hidden="true" size={22} />
                <input
                  id="target-url"
                  name="target"
                  type="text"
                  inputMode="url"
                  placeholder="https://youtube.com/watch?v=..."
                  value={targetUrl}
                  onChange={(event) => setTargetUrl(event.target.value)}
                  required
                />
              </div>
            </label>

            <div className="mode-switch" role="tablist" aria-label="Modo">
              <button className={mode === 'short' ? 'active' : ''} type="button" aria-pressed={mode === 'short'} onClick={() => setMode('short')}>
                <span>Corto</span>
                <small>/s/9Kx2</small>
              </button>
              <button className={mode === 'long' ? 'active' : ''} type="button" aria-pressed={mode === 'long'} onClick={() => setMode('long')}>
                <span>Largo</span>
                <small>/go/root/kernel/payload</small>
              </button>
            </div>

            <div className="field-row">
              <label>
                <span>Alias</span>
                <input id="custom-alias" type="text" placeholder={mode === 'short' ? 'mi-link' : 'root/kernel/payload'} value={customAlias} onChange={(event) => setCustomAlias(event.target.value)} />
              </label>
              <label>
                <span>Etiqueta privada</span>
                <input id="owner-label" type="text" placeholder="campana, clase, prueba" value={ownerLabel} onChange={(event) => setOwnerLabel(event.target.value)} />
              </label>
            </div>

            <details className="metadata">
              <summary>
                <Sparkles aria-hidden="true" size={18} />
                <span>Preview social</span>
              </summary>
              <div className="field-row">
                <label>
                  <span>Titulo</span>
                  <input id="meta-title" type="text" maxLength={140} value={metaTitle} onChange={(event) => setMetaTitle(event.target.value)} />
                </label>
                <label>
                  <span>Imagen</span>
                  <input id="meta-image" type="url" placeholder="https://..." value={metaImage} onChange={(event) => setMetaImage(event.target.value)} />
                </label>
              </div>
              <label>
                <span>Descripcion</span>
                <textarea id="meta-description" maxLength={240} value={metaDescription} onChange={(event) => setMetaDescription(event.target.value)} />
              </label>
              <button className="ghost-button" id="load-preview" type="button" onClick={loadPreview} disabled={previewBusy}>
                <ScanSearch aria-hidden="true" size={18} />
                {previewBusy ? 'Detectando...' : 'Detectar preview'}
              </button>
            </details>

            <div className="form-actions">
              <button className="primary-button" id="submit" type="submit" disabled={busy}>
                {busy ? 'Generando...' : 'Generar enlace'}
                <ArrowRight aria-hidden="true" size={19} />
              </button>
              <p id="status" className={`status ${status.type}`} role="status">{status.message}</p>
            </div>
          </form>

          <section id="result" className={`result ${result ? '' : 'hidden'}`} aria-live="polite">
            <span>Enlace listo</span>
            <a id="result-url" href={result?.short_url || '#'} target="_blank" rel="noreferrer">{result?.short_url || ''}</a>
            <div>
              <button id="copy-link" type="button" onClick={copyResult}><Copy aria-hidden="true" size={17} />{copied ? 'Copiado' : 'Copiar'}</button>
              <a id="stats-url" href={result?.stats_url || '#'}><BarChart3 aria-hidden="true" size={17} />Actividad</a>
            </div>
          </section>
        </section>
      </main>

      <aside className="inspector" aria-label="Vista previa">
        <div className="output-panel">
          <span>Salida</span>
          <strong id="sample-path">{aliasPath}</strong>
          <small>302 directo</small>
        </div>

        <div className="browser-preview">
          <div className="browser-top"><span></span><span></span><span></span></div>
          <div className="browser-body">
            <div id="sample-thumb" className="thumb" style={socialImage ? { backgroundImage: `url("${socialImage}")` } : undefined}></div>
            <div>
              <span id="sample-host">{host === 'sin destino' ? 'linksgood' : host}</span>
              <strong id="sample-title">{socialTitle}</strong>
              <p id="sample-description">{socialDescription}</p>
            </div>
          </div>
        </div>

        <dl className="inspect-list">
          <div><dt>Modo</dt><dd id="sample-mode">{mode === 'short' ? 'Corto' : 'Largo'}</dd></div>
          <div><dt>Destino</dt><dd id="sample-destination">{host}</dd></div>
          <div><dt>Registro</dt><dd>IP, user-agent, referrer, idioma</dd></div>
          <div><dt>Accion</dt><dd><ExternalLink aria-hidden="true" size={15} /> redirect</dd></div>
        </dl>
      </aside>
    </div>
  );
}

createRoot(document.getElementById('root')).render(<App />);
