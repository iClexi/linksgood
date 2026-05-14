import { useEffect, useMemo, useRef, useState } from 'react';
import type { Dispatch, FormEvent, SetStateAction } from 'react';
import { createRoot } from 'react-dom/client';
import { animate, createScope, stagger } from 'animejs';
import {
  ArrowRight,
  BarChart3,
  CheckCircle2,
  Copy,
  Download,
  KeyRound,
  Link2,
  LogIn,
  LogOut,
  MousePointerClick,
  QrCode,
  Route,
  ScanSearch,
  ShieldCheck,
  User,
} from 'lucide-react';
import type { LucideIcon } from 'lucide-react';
import './styles.css';

type Mode = 'short' | 'long';
type AuthMode = 'login' | 'register';
type StatusType = '' | 'success' | 'error';

interface StatusState {
  message: string;
  type: StatusType;
}

interface AuthUser {
  id?: string;
  username: string;
  email?: string;
  role?: 'admin' | 'user' | string;
}

interface AuthResponse {
  user?: AuthUser;
  error?: string;
}

interface PreviewResponse {
  preview?: {
    title?: string;
    description?: string;
    image?: string;
  };
  error?: string;
}

interface LinkResult {
  short_url: string;
  stats_url: string;
  qr_svg_url: string;
  qr_png_url?: string;
  meta_title?: string;
  meta_description?: string;
  meta_image?: string;
}

interface LinkResponse {
  link?: LinkResult;
  error?: string;
}

interface FeatureItem {
  label: string;
  Icon: LucideIcon;
}

interface AuthDialogProps {
  mode: AuthMode;
  setMode: Dispatch<SetStateAction<AuthMode>>;
  onClose: () => void;
  onAuthed: Dispatch<SetStateAction<AuthUser | null>>;
}

const prefersReducedMotion = () => (
  typeof window !== 'undefined' &&
  window.matchMedia('(prefers-reduced-motion: reduce)').matches
);

const parseJson = async <T,>(response: Response): Promise<T> => {
  try {
    return await response.json() as T;
  } catch {
    return {} as T;
  }
};

const errorMessage = (error: unknown, fallback: string) => (
  error instanceof Error && error.message ? error.message : fallback
);

const displayHost = (value: string) => {
  const raw = value.trim();
  if (!raw) return 'sin destino';
  try {
    const url = new URL(raw.includes('://') ? raw : `https://${raw}`);
    return url.hostname.replace(/^www\./, '') || 'sin destino';
  } catch {
    return 'url pendiente';
  }
};

const safeImageUrl = (value: string) => {
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

const featureItems: FeatureItem[] = [
  { label: 'Sin anuncios', Icon: Link2 },
  { label: 'Link corto', Icon: MousePointerClick },
  { label: 'Link largo', Icon: Route },
  { label: 'QR visible', Icon: QrCode },
  { label: 'PNG descargable', Icon: Download },
  { label: 'Actividad visible', Icon: BarChart3 },
  { label: 'Preview editable', Icon: ScanSearch },
  { label: 'Alias propio', Icon: KeyRound },
  { label: 'Sin cuenta', Icon: User },
  { label: 'Redirect directo', Icon: ShieldCheck },
  { label: 'Historial opcional', Icon: Copy },
  { label: 'Listo al instante', Icon: ArrowRight },
];

function AuthDialog({ mode, setMode, onClose, onAuthed }: AuthDialogProps) {
  const [form, setForm] = useState({ username: '', email: '', password: '' });
  const [message, setMessage] = useState('');
  const [busy, setBusy] = useState(false);

  const submit = async (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    setBusy(true);
    setMessage('');
    try {
      const response = await fetch(mode === 'login' ? '/api/auth/login' : '/api/auth/register', {
        method: 'POST',
        headers: { 'content-type': 'application/json' },
        credentials: 'same-origin',
        body: JSON.stringify(form),
      });
      const data = await parseJson<AuthResponse>(response);
      if (!response.ok) throw new Error(data.error || 'No se pudo entrar.');
      if (!data.user) throw new Error('No se pudo leer el usuario.');
      onAuthed(data.user);
      onClose();
    } catch (error) {
      setMessage(errorMessage(error, 'No se pudo entrar.'));
    } finally {
      setBusy(false);
    }
  };

  return (
    <div className="auth-modal" role="presentation" onMouseDown={onClose}>
      <section className="auth-panel glass" role="dialog" aria-modal="true" aria-label="Acceso" onMouseDown={(event) => event.stopPropagation()}>
        <div className="auth-head">
          <div>
            <p className="eyebrow">Cuenta opcional</p>
            <h2>{mode === 'login' ? 'Entrar a Linksgood' : 'Crear cuenta'}</h2>
          </div>
          <button className="icon-button" type="button" onClick={onClose} aria-label="Cerrar">×</button>
        </div>
        <p className="auth-copy">
          {mode === 'login'
            ? 'Tu historial, QR y sesiones aparecen cuando entras. Crear links sigue funcionando sin cuenta.'
            : 'La cuenta sólo guarda tus enlaces y dispositivos. No bloquea el uso rápido.'}
        </p>
        <div className="auth-tabs" role="tablist" aria-label="Autenticación">
          <button className={mode === 'login' ? 'auth-tab active' : 'auth-tab'} type="button" onClick={() => setMode('login')}>Entrar</button>
          <button className={mode === 'register' ? 'auth-tab active' : 'auth-tab'} type="button" onClick={() => setMode('register')}>Crear cuenta</button>
        </div>
        <form className="auth-form" onSubmit={submit}>
          {mode === 'register' ? (
            <label>
              <span>Usuario</span>
              <input value={form.username} onChange={(event) => setForm({ ...form, username: event.target.value })} autoComplete="username" required />
            </label>
          ) : null}
          <label>
            <span>Email</span>
            <input type="email" value={form.email} onChange={(event) => setForm({ ...form, email: event.target.value })} autoComplete="email" required />
          </label>
          <label>
            <span>Contraseña</span>
            <input type="password" value={form.password} onChange={(event) => setForm({ ...form, password: event.target.value })} autoComplete={mode === 'login' ? 'current-password' : 'new-password'} required />
          </label>
          <button className="primary-button" type="submit" disabled={busy}>
            {busy ? 'Procesando...' : mode === 'login' ? 'Entrar' : 'Crear cuenta'}
            <ArrowRight aria-hidden="true" size={18} />
          </button>
          {message ? <p className="status error" role="status">{message}</p> : null}
        </form>
      </section>
    </div>
  );
}

function App() {
  const shellRef = useRef<HTMLDivElement | null>(null);
  const [mode, setMode] = useState<Mode>('short');
  const [targetUrl, setTargetUrl] = useState('');
  const [customAlias, setCustomAlias] = useState('');
  const [ownerLabel, setOwnerLabel] = useState('');
  const [metaTitle, setMetaTitle] = useState('');
  const [metaDescription, setMetaDescription] = useState('');
  const [metaImage, setMetaImage] = useState('');
  const [status, setStatus] = useState<StatusState>({ message: '', type: '' });
  const [result, setResult] = useState<LinkResult | null>(null);
  const [authUser, setAuthUser] = useState<AuthUser | null>(null);
  const [authOpen, setAuthOpen] = useState(false);
  const [authMode, setAuthMode] = useState<AuthMode>('login');
  const [busy, setBusy] = useState(false);
  const [previewBusy, setPreviewBusy] = useState(false);
  const [copied, setCopied] = useState(false);

  const aliasPath = useMemo(() => {
    const alias = customAlias.trim().replace(/^\/+/, '').replace(/\/+$/, '');
    if (!alias) return mode === 'short' ? '/s/link' : '/go/clase/material/importante';
    return `${mode === 'short' ? '/s' : '/go'}/${alias}`;
  }, [customAlias, mode]);

  const host = useMemo(() => displayHost(targetUrl), [targetUrl]);
  const previewTitle = metaTitle.trim() || (host === 'sin destino' ? 'Tu link queda listo aquí' : host);
  const previewDescription = metaDescription.trim() || 'Linksgood crea un enlace corto, largo o QR con actividad visible para el creador.';
  const previewImage = safeImageUrl(metaImage);

  useEffect(() => {
    fetch('/api/auth/me', { credentials: 'same-origin' })
      .then((response) => response.ok ? parseJson<AuthResponse>(response) : { user: undefined })
      .then((data) => setAuthUser(data.user || null))
      .catch(() => {});
  }, []);

  useEffect(() => {
    if (!shellRef.current || prefersReducedMotion()) return undefined;
    const scope = createScope({ root: shellRef.current }).add(() => {
      animate('.motion-rise', {
        opacity: [0, 1],
        translateY: [18, 0],
        duration: 620,
        delay: stagger(55),
        ease: 'outCubic',
      });
    });
    return () => scope.revert();
  }, []);

  const setMessage = (message: string, type: StatusType = '') => setStatus({ message, type });

  const openAuth = (nextMode: AuthMode) => {
    setAuthMode(nextMode);
    setAuthOpen(true);
  };

  const logout = async () => {
    await fetch('/api/auth/logout', { method: 'POST', credentials: 'same-origin' }).catch(() => {});
    setAuthUser(null);
  };

  const loadPreview = async () => {
    const value = targetUrl.trim();
    if (!value) {
      setMessage('Pega un link primero.', 'error');
      return;
    }

    setPreviewBusy(true);
    setMessage('Buscando título e imagen del destino...');
    try {
      const response = await fetch('/api/preview', {
        method: 'POST',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify({ target_url: value }),
      });
      const data = await parseJson<PreviewResponse>(response);
      if (!response.ok) throw new Error(data.error || 'No se pudo cargar la vista.');
      setMetaTitle(data.preview?.title || '');
      setMetaDescription(data.preview?.description || '');
      setMetaImage(data.preview?.image || '');
      setMessage('Preview detectado.', 'success');
    } catch (error) {
      setMessage(errorMessage(error, 'No se pudo cargar la vista.'), 'error');
    } finally {
      setPreviewBusy(false);
    }
  };

  const createLink = async (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    const value = targetUrl.trim();
    if (!value) {
      setMessage('Pega un link primero.', 'error');
      return;
    }

    setBusy(true);
    setResult(null);
    setMessage('Generando link y QR...');
    try {
      const response = await fetch('/api/links', {
        method: 'POST',
        headers: { 'content-type': 'application/json' },
        credentials: 'same-origin',
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
      const data = await parseJson<LinkResponse>(response);
      if (!response.ok) throw new Error(data.error || 'No se pudo crear el link.');
      if (!data.link) throw new Error('No se pudo leer el link generado.');
      setResult(data.link);
      if (!metaTitle && data.link.meta_title) setMetaTitle(data.link.meta_title);
      if (!metaDescription && data.link.meta_description) setMetaDescription(data.link.meta_description);
      if (!metaImage && data.link.meta_image) setMetaImage(data.link.meta_image);
      setMessage(authUser ? 'Guardado en tu historial.' : 'Listo. Copia el link o descarga el QR.', 'success');
    } catch (error) {
      setMessage(errorMessage(error, 'No se pudo crear el link.'), 'error');
    } finally {
      setBusy(false);
    }
  };

  const copyResult = async () => {
    if (!result?.short_url) return;
    try {
      await navigator.clipboard.writeText(result.short_url);
      setCopied(true);
      setMessage('Link copiado.', 'success');
      setTimeout(() => setCopied(false), 1300);
    } catch {
      setMessage('No se pudo copiar automáticamente.', 'error');
    }
  };

  return (
    <div className="app-shell" ref={shellRef}>
      <div className="aurora" aria-hidden="true"><span className="grid-bg" /></div>

      <header className="topbar motion-rise">
        <a className="brand" href="/" aria-label="Linksgood inicio">
          <span className="brand-mark" aria-hidden="true"><Link2 size={18} /></span>
          <span className="brand-name">Linksgood Studio</span>
        </a>

        <div className="topbar-actions">
          <a className="topbar-link" href="/terminos">Términos</a>
          <a className="topbar-link" href="/privacidad">Privacidad</a>
          {authUser ? <a className="topbar-link" href="/cuenta">Historial</a> : null}
          {authUser?.role === 'admin' ? <a className="topbar-link" href="/admin">Admin</a> : null}
          {authUser ? (
            <>
              <span className="session-user"><User aria-hidden="true" size={15} />{authUser.username}</span>
              <button className="topbar-button" type="button" onClick={logout}><LogOut aria-hidden="true" size={15} />Salir</button>
            </>
          ) : (
            <button className="topbar-button" type="button" onClick={() => openAuth('login')}><LogIn aria-hidden="true" size={15} />Entrar</button>
          )}
        </div>
      </header>

      <main className="shell">
        <section className="hero">
          <h1 className="title motion-rise">
            Links cortos, largos y <span className="grad">QR en segundos</span>.
          </h1>
          <p className="subtitle motion-rise">
            Pega un enlace, elige corto o largo, y sal con un link limpio sin anuncios intrusivos ni cuenta obligatoria.
          </p>

          <form id="link-form" className="card glass converter-card motion-rise" onSubmit={createLink}>
            <div className="converter-intro">
              <div>
                <p className="eyebrow">Linksgood Studio</p>
                <h2 className="converter-title">Tu link listo en el mismo centro.</h2>
              </div>
              <div className="converter-pills" aria-label="Funciones principales">
                <span>Corto</span>
                <span>Largo</span>
                <span>QR</span>
                <span>Actividad</span>
              </div>
            </div>

            <div className="mode-tabs" role="tablist" aria-label="Modo del link">
              <button className={mode === 'short' ? 'active' : ''} type="button" aria-pressed={mode === 'short'} onClick={() => setMode('short')}>
                <MousePointerClick aria-hidden="true" size={18} />
                Corto
              </button>
              <button className={mode === 'long' ? 'active' : ''} type="button" aria-pressed={mode === 'long'} onClick={() => setMode('long')}>
                <Route aria-hidden="true" size={18} />
                Largo
              </button>
            </div>

            <label className="sr-only" htmlFor="target-url">Link de destino</label>
            <div className="field">
              <Link2 className="field-icon" aria-hidden="true" size={22} />
              <input
                id="target-url"
                name="target"
                type="text"
                inputMode="url"
                autoComplete="off"
                spellCheck="false"
                placeholder="https://ejemplo.com/recurso"
                value={targetUrl}
                onChange={(event) => setTargetUrl(event.target.value)}
                required
              />
              <button className="ghost detect-button" type="button" onClick={loadPreview} disabled={previewBusy} aria-label="Detectar preview">
                <ScanSearch aria-hidden="true" size={18} />
                <span>{previewBusy ? 'Leyendo' : 'Preview'}</span>
              </button>
            </div>

            <details className="metadata">
              <summary>
                <CheckCircle2 aria-hidden="true" size={18} />
                Personalizar alias, título e imagen
              </summary>
              <div className="field-row">
                <label>
                  <span>Alias opcional</span>
                  <input id="custom-alias" type="text" placeholder={mode === 'short' ? 'mi-link' : 'clase/tema/archivo'} value={customAlias} onChange={(event) => setCustomAlias(event.target.value)} />
                </label>
                <label>
                  <span>Etiqueta privada</span>
                  <input id="owner-label" type="text" placeholder="clase, campaña, prueba" value={ownerLabel} onChange={(event) => setOwnerLabel(event.target.value)} />
                </label>
              </div>
              <div className="field-row">
                <label>
                  <span>Título</span>
                  <input id="meta-title" type="text" maxLength={140} value={metaTitle} onChange={(event) => setMetaTitle(event.target.value)} />
                </label>
                <label>
                  <span>Imagen</span>
                  <input id="meta-image" type="text" inputMode="url" autoComplete="off" spellCheck="false" placeholder="https://..." value={metaImage} onChange={(event) => setMetaImage(event.target.value)} />
                </label>
              </div>
              <label>
                <span>Descripción</span>
                <textarea id="meta-description" maxLength={240} value={metaDescription} onChange={(event) => setMetaDescription(event.target.value)} />
              </label>
            </details>

            <div className="actions">
              <button className="primary-button" id="submit" type="submit" disabled={busy}>
                <span>{busy ? 'Generando...' : 'Generar link'}</span>
                <ArrowRight aria-hidden="true" size={19} />
              </button>
              <p id="status" className={`status ${status.type}`} role="status">{status.message}</p>
            </div>

            {result ? (
              <section className="inline-result" aria-label="Link generado">
                <div className="inline-result-main">
                  <div>
                    <p className="eyebrow">Link listo</p>
                    <h2 className="section-title">Cópialo aquí mismo.</h2>
                  </div>
                  <a id="result-url" className="result-link" href={result.short_url} target="_blank" rel="noreferrer">{result.short_url}</a>
                  <div className="result-actions">
                    <button className="ghost" id="copy-link" type="button" onClick={copyResult}><Copy aria-hidden="true" size={17} />{copied ? 'Copiado' : 'Copiar'}</button>
                    <a className="ghost" id="stats-url" href={result.stats_url}><BarChart3 aria-hidden="true" size={17} />Actividad</a>
                    <a className="ghost" id="qr-view-url" href={result.qr_svg_url} target="_blank" rel="noreferrer"><QrCode aria-hidden="true" size={17} />Ver QR</a>
                    <a className="ghost" id="qr-download-url" href={result.qr_png_url || result.qr_svg_url} download><Download aria-hidden="true" size={17} />PNG</a>
                  </div>
                </div>
                <a className="qr-preview-box" href={result.qr_svg_url} target="_blank" rel="noreferrer" aria-label="Ver QR">
                  <img src={result.qr_svg_url} alt="QR del link generado" />
                </a>
              </section>
            ) : null}
          </form>

          <ul className="features motion-rise" aria-label="Características">
            {featureItems.map(({ label, Icon }) => (
              <li key={label}><span className="feat-icon"><Icon size={16} /></span><span>{label}</span></li>
            ))}
          </ul>

          <section className="card glass preview-card motion-rise" aria-label="Preview social">
            <div className="preview-top">
              <div className="preview-thumb" style={previewImage ? { backgroundImage: `url("${previewImage}")` } : undefined}>
                {!previewImage ? <span>LG</span> : null}
              </div>
              <div className="preview-meta">
                <div className="preview-row">
                  <span className="badge">{mode === 'short' ? 'Corto' : 'Largo'}</span>
                  <span className="dot" />
                  <span className="muted">{aliasPath}</span>
                </div>
                <h2 className="preview-title">{previewTitle}</h2>
                <p>{previewDescription}</p>
              </div>
            </div>
            <dl className="inspect-list">
              <div><dt>Destino</dt><dd>{host}</dd></div>
              <div><dt>QR</dt><dd>incluido</dd></div>
              <div><dt>Cuenta</dt><dd>{authUser ? 'historial activo' : 'opcional'}</dd></div>
              <div><dt>Visitas</dt><dd>link y QR</dd></div>
            </dl>
          </section>

          <section className="card glass idle-panel motion-rise" aria-label="Estado del link">
            <div className="idle-head">
              <div>
                <p className="eyebrow">Tres salidas</p>
                <h2 className="section-title">Link presentable, QR y actividad.</h2>
              </div>
              <span className="idle-status">{result ? 'Creado' : 'Ready'}</span>
            </div>
            <div className="mode-strip">
              <span><strong>Corto</strong><small>para documentos</small></span>
              <span><strong>Largo</strong><small>para rutas fake</small></span>
              <span><strong>QR</strong><small>para compartir físico</small></span>
              <span><strong>Stats</strong><small>para saber alcance</small></span>
            </div>
          </section>

          <section className="card glass seo-card motion-rise">
            <div className="seo-grid">
              <div>
                <p className="eyebrow">Qué hace</p>
                <h2 className="section-title">Un centro rápido para arreglar links.</h2>
                <p className="section-copy">
                  Linksgood no intenta venderte una suite gigante. Sirve para pegar un destino,
                  crear una versión más limpia o más larga, descargar QR y revisar actividad básica.
                </p>
              </div>
              <div className="seo-points">
                <article><h3>Sin cuenta obligatoria</h3><p>Entras, pegas, generas y copias.</p></article>
                <article><h3>Preview editable</h3><p>Detecta título e imagen cuando el destino los expone.</p></article>
                <article><h3>Actividad visible</h3><p>El creador ve visitas, referrer, user-agent y origen QR/link.</p></article>
              </div>
            </div>
          </section>
        </section>
      </main>

      <footer className="footer motion-rise">
        <span>Linksgood Studio</span>
        <span className="muted">·</span>
        <a className="footer-link" href="/terminos">Términos</a>
        <span className="muted">·</span>
        <a className="footer-link" href="/privacidad">Privacidad</a>
      </footer>

      {authOpen ? <AuthDialog mode={authMode} setMode={setAuthMode} onClose={() => setAuthOpen(false)} onAuthed={setAuthUser} /> : null}
    </div>
  );
}

const rootElement = document.getElementById('root');

if (!rootElement) {
  throw new Error('No se encontró el contenedor principal.');
}

createRoot(rootElement).render(<App />);
