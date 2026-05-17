import { useEffect, useMemo, useRef, useState } from 'react';
import type { Dispatch, FormEvent, SetStateAction, SyntheticEvent } from 'react';
import { createRoot } from 'react-dom/client';
import { animate, createScope, createTimeline, spring, stagger } from 'animejs';
import { splitText } from 'animejs/text';
import {
  ArrowRight,
  BarChart3,
  CheckCircle2,
  Copy,
  Download,
  Eye,
  EyeOff,
  KeyRound,
  Link2,
  LogIn,
  LogOut,
  Mail,
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
  const panelRef = useRef<HTMLElement | null>(null);
  const formRef = useRef<HTMLFormElement | null>(null);
  const messageRef = useRef<HTMLParagraphElement | null>(null);
  const passwordToggleRef = useRef<HTMLButtonElement | null>(null);
  const [form, setForm] = useState({ username: '', email: '', password: '' });
  const [message, setMessage] = useState('');
  const [busy, setBusy] = useState(false);
  const [showPassword, setShowPassword] = useState(false);

  useEffect(() => {
    if (!panelRef.current || prefersReducedMotion()) return;
    animate(panelRef.current, {
      opacity: [0, 1],
      scale: [0.96, 1],
      translateY: [18, 0],
      duration: 520,
      ease: spring({ bounce: 0.22, duration: 520 }),
    });
    animate(panelRef.current.querySelectorAll('label, .auth-tab, .primary-button'), {
      opacity: [0, 1],
      translateY: [10, 0],
      delay: stagger(35, { start: 120 }),
      duration: 360,
      ease: 'outCubic',
    });
  }, []);

  useEffect(() => {
    if (!panelRef.current || prefersReducedMotion()) return;
    animate(panelRef.current.querySelectorAll('.auth-copy, .auth-field, .auth-security-strip span'), {
      opacity: [0.48, 1],
      translateY: [8, 0],
      duration: 340,
      delay: stagger(34),
      ease: 'outCubic',
    });
    const activeTab = panelRef.current.querySelector('.auth-tab.active');
    if (activeTab) {
      animate(activeTab, {
        scale: [0.95, 1],
        duration: 360,
        ease: spring({ bounce: 0.32, duration: 360 }),
      });
    }
  }, [mode]);

  useEffect(() => {
    if (!busy || !formRef.current || prefersReducedMotion()) return undefined;
    const button = formRef.current.querySelector('.auth-submit');
    const icon = button?.querySelector('svg');
    if (!button) return undefined;
    const pulse = animate(button, {
      scale: [1, 1.018, 1],
      duration: 820,
      loop: true,
      ease: 'inOutSine',
    });
    const arrow = icon ? animate(icon, {
      translateX: [0, 5, 0],
      duration: 680,
      loop: true,
      ease: 'inOutSine',
    }) : null;
    return () => {
      pulse.cancel();
      arrow?.cancel();
      animate(button, { scale: 1, duration: 120, ease: 'outCubic' });
    };
  }, [busy]);

  useEffect(() => {
    if (!message || !messageRef.current || prefersReducedMotion()) return;
    animate(messageRef.current, {
      opacity: [0, 1],
      translateY: [6, 0],
      duration: 260,
      ease: 'outCubic',
    });
  }, [message]);

  useEffect(() => {
    if (!passwordToggleRef.current || prefersReducedMotion()) return;
    animate(passwordToggleRef.current, {
      scale: [0.86, 1],
      rotate: [showPassword ? -8 : 8, 0],
      duration: 240,
      ease: 'outBack',
    });
  }, [showPassword]);

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
      <section ref={panelRef} className="auth-panel glass" role="dialog" aria-modal="true" aria-label="Acceso" onMouseDown={(event) => event.stopPropagation()}>
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
        <div className="auth-security-strip" aria-label="Ventajas de cuenta">
          <span>Historial</span>
          <span>QR</span>
        </div>
        <div className="auth-tabs" role="tablist" aria-label="Autenticación">
          <button className={mode === 'login' ? 'auth-tab active' : 'auth-tab'} type="button" onClick={() => setMode('login')}>Entrar</button>
          <button className={mode === 'register' ? 'auth-tab active' : 'auth-tab'} type="button" onClick={() => setMode('register')}>Crear cuenta</button>
        </div>
        <form ref={formRef} className="auth-form" onSubmit={submit}>
          {mode === 'register' ? (
            <label className="auth-field">
              <span>Usuario</span>
              <span className="auth-input-wrap">
                <User aria-hidden="true" size={17} />
                <input value={form.username} onChange={(event) => setForm({ ...form, username: event.target.value })} autoComplete="username" required />
              </span>
            </label>
          ) : null}
          <label className="auth-field">
            <span>Email</span>
            <span className="auth-input-wrap">
              <Mail aria-hidden="true" size={17} />
              <input type="email" value={form.email} onChange={(event) => setForm({ ...form, email: event.target.value })} autoComplete="email" required />
            </span>
          </label>
          <label className="auth-field">
            <span>Contraseña</span>
            <span className="auth-input-wrap">
              <KeyRound aria-hidden="true" size={17} />
              <input type={showPassword ? 'text' : 'password'} value={form.password} onChange={(event) => setForm({ ...form, password: event.target.value })} autoComplete={mode === 'login' ? 'current-password' : 'new-password'} required />
              <button
                ref={passwordToggleRef}
                className="password-toggle"
                type="button"
                aria-label={showPassword ? 'Ocultar contraseña' : 'Ver contraseña'}
                aria-pressed={showPassword}
                onClick={() => setShowPassword((value) => !value)}
              >
                {showPassword ? <EyeOff aria-hidden="true" size={17} /> : <Eye aria-hidden="true" size={17} />}
              </button>
            </span>
          </label>
          <button className={busy ? 'primary-button auth-submit is-busy' : 'primary-button auth-submit'} type="submit" disabled={busy}>
            {busy ? 'Procesando...' : mode === 'login' ? 'Entrar' : 'Crear cuenta'}
            <ArrowRight aria-hidden="true" size={18} />
          </button>
          {message ? <p ref={messageRef} className="status error" role="status">{message}</p> : null}
        </form>
      </section>
    </div>
  );
}

function App() {
  const shellRef = useRef<HTMLDivElement | null>(null);
  const formRef = useRef<HTMLFormElement | null>(null);
  const fieldRef = useRef<HTMLDivElement | null>(null);
  const previewRef = useRef<HTMLElement | null>(null);
  const resultRef = useRef<HTMLElement | null>(null);
  const statusRef = useRef<HTMLParagraphElement | null>(null);
  const didTypeRef = useRef(false);
  const didPreviewRef = useRef(false);
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
  const [introDone, setIntroDone] = useState(false);

  const aliasPath = useMemo(() => {
    const alias = customAlias.trim().replace(/^\/+/, '').replace(/\/+$/, '');
    if (!alias) return mode === 'short' ? '/s/link' : '/go/clase/material/importante';
    return `${mode === 'short' ? '/s' : '/go'}/${alias}`;
  }, [customAlias, mode]);

  const host = useMemo(() => displayHost(targetUrl), [targetUrl]);
  const previewTitle = metaTitle.trim() || (host === 'sin destino' ? 'Tu link queda listo aquí' : host);
  const previewDescription = metaDescription.trim() || 'Linksgood crea un enlace corto, largo o QR con actividad visible para el creador.';
  const previewImage = safeImageUrl(metaImage);
  const hasTarget = targetUrl.trim().length > 0;
  const hasPreview = Boolean(metaTitle.trim() || metaDescription.trim() || previewImage);
  const flowStage = result ? 3 : busy ? 2 : hasPreview ? 1 : hasTarget ? 0 : -1;
  const flowProgress = `${Math.max(0, flowStage) / 3 * 100}%`;

  useEffect(() => {
    fetch('/api/auth/me', { credentials: 'same-origin' })
      .then((response) => response.ok ? parseJson<AuthResponse>(response) : { user: undefined })
      .then((data) => setAuthUser(data.user || null))
      .catch(() => {});
  }, []);

  useEffect(() => {
    if (!shellRef.current) return undefined;
    if (prefersReducedMotion()) {
      setIntroDone(true);
      return undefined;
    }
    const scope = createScope({ root: shellRef.current }).add(() => {
      const titleSplit = splitText('.title-copy', {
        accessible: false,
        words: { wrap: 'clip', class: 'split-word' },
      });
      const titleWords = titleSplit.words as HTMLElement[];
      titleWords.forEach((word) => {
        if (word.closest('.grad')) word.classList.add('grad-word');
      });

      animate('.loader-node', {
        opacity: [0.25, 1, 0.25],
        scale: [0.64, 1.16, 0.64],
        duration: 760,
        delay: stagger(90),
        loop: true,
        ease: 'inOutSine',
      });

      animate('.loader-link', {
        scaleX: [0, 1],
        opacity: [0.1, 0.86],
        duration: 520,
        delay: stagger(100, { start: 120 }),
        ease: 'outCubic',
      });

      animate('.loader-bar-fill', {
        width: ['0%', '100%'],
        duration: 980,
        ease: 'inOutCubic',
      });

      animate('.boot-loader', {
        opacity: [1, 0],
        scale: [1, 1.018],
        duration: 360,
        delay: 1050,
        ease: 'outCubic',
        onComplete: () => setIntroDone(true),
      });

      createTimeline({ defaults: { ease: 'outCubic' } })
        .add('.topbar.motion-rise', {
          opacity: [0, 1],
          translateY: [-16, 0],
          duration: 520,
        }, 520)
        .add(titleWords, {
          opacity: [0, 1],
          translateY: ['104%', '0%'],
          filter: ['blur(10px)', 'blur(0px)'],
          duration: 920,
          delay: stagger(72),
          ease: 'out(4)',
        }, 650)
        .add('.title-copy .grad-word', {
          opacity: [0.86, 1],
          scale: [0.982, 1],
          duration: 580,
          delay: stagger(42),
          ease: 'out(3)',
        }, 980)
        .add('.subtitle.motion-rise', {
          opacity: [0, 1],
          translateY: [20, 0],
          duration: 620,
        }, 1050)
        .add('#link-form.motion-rise', {
          opacity: [0, 1],
          translateY: [26, 0],
          scale: [0.985, 1],
          duration: 720,
        }, 1130)
        .add('.features.motion-rise, .preview-card.motion-rise, .idle-panel.motion-rise, .seo-card.motion-rise, .footer.motion-rise', {
          opacity: [0, 1],
          translateY: [18, 0],
          duration: 620,
          delay: stagger(45),
        }, 1320);

      animate('.converter-pills span, .flow-node', {
        opacity: [0, 1],
        translateY: [10, 0],
        scale: [0.92, 1],
        duration: 420,
        delay: stagger(42, { start: 1220 }),
        ease: 'outCubic',
      });

      animate('.feature-chip, .inspect-list div, .mode-strip span, .seo-points article', {
        opacity: [0, 1],
        translateY: [18, 0],
        scale: [0.965, 1],
        duration: 520,
        delay: stagger(38, { start: 1340 }),
        ease: spring({ bounce: 0.24, duration: 520 }),
      });

      animate('.feature-chip .feat-icon', {
        scale: [0.82, 1.14, 1],
        rotate: [-10, 4, 0],
        duration: 680,
        delay: stagger(48, { start: 1500 }),
        ease: 'outCubic',
      });

      animate('.idle-status', {
        boxShadow: [
          '0 0 0 rgba(234, 43, 31, 0)',
          '0 0 24px rgba(234, 43, 31, 0.36)',
          '0 0 0 rgba(234, 43, 31, 0)',
        ],
        duration: 2200,
        loop: true,
        ease: 'inOutSine',
      });

      animate('.signal-dot', {
        opacity: [0, 1, 1, 0],
        translateX: ['-12vw', '112vw'],
        duration: 4200,
        delay: stagger(620),
        loop: true,
        ease: 'linear',
      });

      animate('.converter-scan', {
        opacity: [0, 0.8, 0],
        translateX: ['-125%', '225%'],
        duration: 1700,
        delay: 1450,
        loop: 2,
        ease: 'inOutSine',
      });

      animate('.brand-mark', {
        rotate: [-12, 0],
        scale: [0.84, 1],
        duration: 720,
        delay: 620,
        ease: spring({ bounce: 0.38, duration: 720 }),
      });

      return () => titleSplit.revert();
    });
    return () => scope.revert();
  }, []);

  useEffect(() => {
    if (!introDone || !shellRef.current || prefersReducedMotion()) return undefined;
    const targets = Array.from(shellRef.current.querySelectorAll<HTMLElement>(
      '.feature-chip, .inspect-list div, .seo-points article, .preview-card, .idle-panel, .seo-card',
    ));
    const cleanups = targets.map((target) => {
      const enter = () => {
        animate(target, {
          translateY: -5,
          scale: 1.012,
          duration: 240,
          ease: 'outCubic',
        });
      };
      const leave = () => {
        animate(target, {
          translateY: 0,
          scale: 1,
          duration: 260,
          ease: 'outCubic',
        });
      };
      target.addEventListener('pointerenter', enter);
      target.addEventListener('pointerleave', leave);
      return () => {
        target.removeEventListener('pointerenter', enter);
        target.removeEventListener('pointerleave', leave);
      };
    });
    return () => cleanups.forEach((cleanup) => cleanup());
  }, [introDone]);

  useEffect(() => {
    if (!fieldRef.current || prefersReducedMotion()) return;
    if (!hasTarget) {
      didTypeRef.current = false;
      return;
    }
    const icon = fieldRef.current.querySelector('.field-icon');
    animate(fieldRef.current, {
      scale: [1, 1.007, 1],
      duration: 260,
      ease: 'outCubic',
    });
    if (icon) {
      animate(icon, {
        rotate: [didTypeRef.current ? -4 : -12, 0],
        scale: [1.12, 1],
        duration: 320,
        ease: 'outBack',
      });
    }
    didTypeRef.current = true;
  }, [hasTarget, targetUrl]);

  useEffect(() => {
    if (!shellRef.current || prefersReducedMotion()) return;
    const fill = shellRef.current.querySelector('.flow-line-fill');
    const activeNodes = shellRef.current.querySelectorAll('.flow-node.is-active');
    if (fill) {
      animate(fill, {
        width: flowProgress,
        duration: 520,
        ease: 'outCubic',
      });
    }
    if (activeNodes.length) {
      animate(activeNodes, {
        scale: [0.82, 1],
        opacity: [0.62, 1],
        duration: 460,
        delay: stagger(36),
        ease: spring({ bounce: 0.34, duration: 460 }),
      });
    }
  }, [flowProgress, flowStage]);

  useEffect(() => {
    if (!formRef.current || prefersReducedMotion()) return;
    const activeButton = formRef.current.querySelector('.mode-tabs button.active');
    const badge = previewRef.current?.querySelector('.badge');
    if (activeButton) {
      animate(activeButton, {
        scale: [0.96, 1],
        duration: 360,
        ease: spring({ bounce: 0.3, duration: 360 }),
      });
    }
    if (badge) {
      animate(badge, {
        translateY: [6, 0],
        opacity: [0.5, 1],
        duration: 280,
        ease: 'outCubic',
      });
    }
  }, [mode]);

  useEffect(() => {
    if (!previewRef.current || prefersReducedMotion()) return;
    if (!didPreviewRef.current) {
      didPreviewRef.current = true;
      return;
    }
    animate(previewRef.current, {
      translateY: [5, 0],
      scale: [0.995, 1],
      duration: 420,
      ease: 'outCubic',
    });
    animate(previewRef.current.querySelectorAll('.preview-thumb, .preview-title, .preview-meta p, .inspect-list div'), {
      opacity: [0.58, 1],
      translateY: [8, 0],
      duration: 360,
      delay: stagger(28),
      ease: 'outCubic',
    });
  }, [aliasPath, authUser, mode, previewDescription, previewImage, previewTitle]);

  useEffect(() => {
    if (!busy || !formRef.current || prefersReducedMotion()) return undefined;
    const button = formRef.current.querySelector('#submit');
    if (!button) return undefined;
    const icon = button.querySelector('svg');
    const pulse = animate(button, {
      scale: [1, 1.012, 1],
      duration: 900,
      loop: true,
      ease: 'inOutSine',
    });
    const arrow = icon ? animate(icon, {
      translateX: [0, 5, 0],
      duration: 700,
      loop: true,
      ease: 'inOutSine',
    }) : null;
    return () => {
      pulse.cancel();
      arrow?.cancel();
      animate(button, { scale: 1, duration: 120, ease: 'outCubic' });
    };
  }, [busy]);

  useEffect(() => {
    if (!status.message || !statusRef.current || prefersReducedMotion()) return;
    animate(statusRef.current, {
      opacity: [0, 1],
      translateY: [5, 0],
      duration: 240,
      ease: 'outCubic',
    });
  }, [status.message, status.type]);

  useEffect(() => {
    if (!result || !resultRef.current || prefersReducedMotion()) return;
    animate(resultRef.current, {
      opacity: [0, 1],
      translateY: [22, 0],
      scale: [0.982, 1],
      duration: 560,
      ease: spring({ bounce: 0.28, duration: 560 }),
    });
    animate(resultRef.current.querySelectorAll('.result-link, .result-actions .ghost, .qr-preview-box'), {
      opacity: [0, 1],
      translateY: [12, 0],
      duration: 420,
      delay: stagger(55, { start: 80 }),
      ease: 'outCubic',
    });
  }, [result]);

  useEffect(() => {
    if (!copied || !resultRef.current || prefersReducedMotion()) return;
    const button = resultRef.current.querySelector('#copy-link');
    const link = resultRef.current.querySelector('.result-link');
    if (button) {
      animate(button, {
        scale: [1, 1.06, 1],
        duration: 360,
        ease: spring({ bounce: 0.45, duration: 360 }),
      });
    }
    if (link) {
      animate(link, {
        backgroundColor: ['rgba(74, 222, 128, 0.16)', 'rgba(0, 0, 0, 0.32)'],
        duration: 620,
        ease: 'outCubic',
      });
    }
  }, [copied]);

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

  const animateMetadata = (event: SyntheticEvent<HTMLDetailsElement>) => {
    if (!event.currentTarget.open || prefersReducedMotion()) return;
    animate(event.currentTarget.querySelectorAll('label'), {
      opacity: [0, 1],
      translateY: [12, 0],
      duration: 360,
      delay: stagger(42),
      ease: 'outCubic',
    });
  };

  return (
    <div className="app-shell" ref={shellRef}>
      {!introDone ? (
        <div className="boot-loader" aria-hidden="true">
          <div className="loader-card">
            <div className="loader-symbol">
              <span className="loader-node" />
              <span className="loader-link" />
              <span className="loader-node" />
              <span className="loader-link" />
              <span className="loader-node" />
            </div>
            <div className="loader-word">Linksgood</div>
            <div className="loader-bar"><span className="loader-bar-fill" /></div>
          </div>
        </div>
      ) : null}

      <div className="aurora" aria-hidden="true">
        <span className="grid-bg" />
        <span className="signal-lane lane-one"><i className="signal-dot" /></span>
        <span className="signal-lane lane-two"><i className="signal-dot" /></span>
        <span className="signal-lane lane-three"><i className="signal-dot" /></span>
      </div>

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
          <h1 className="title title-copy motion-rise">
            Links cortos, largos y <span className="grad">QR en segundos</span>.
          </h1>
          <p className="subtitle motion-rise">
            Pega un enlace, elige corto o largo, y sal con un link limpio sin anuncios intrusivos ni cuenta obligatoria.
          </p>

          <form ref={formRef} id="link-form" className="card glass converter-card motion-rise" onSubmit={createLink}>
            <span className="converter-scan" aria-hidden="true" />
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
            <div ref={fieldRef} className={hasTarget ? 'field is-filled' : 'field'}>
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

            <div className="flow-meter" aria-hidden="true">
              <span className="flow-line"><span className="flow-line-fill" style={{ width: flowProgress }} /></span>
              {[0, 1, 2, 3].map((stage) => (
                <span key={stage} className={flowStage >= stage ? 'flow-node is-active' : 'flow-node'} />
              ))}
            </div>

            <details className="metadata" onToggle={animateMetadata}>
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
              <button className={busy ? 'primary-button is-busy' : 'primary-button'} id="submit" type="submit" disabled={busy}>
                <span>{busy ? 'Generando...' : 'Generar link'}</span>
                <ArrowRight aria-hidden="true" size={19} />
              </button>
              <p ref={statusRef} id="status" className={`status ${status.type}`} role="status">{status.message}</p>
            </div>

            {result ? (
              <section ref={resultRef} className="inline-result" aria-label="Link generado">
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
              <li className="feature-chip" key={label}><span className="feat-icon"><Icon size={16} /></span><span>{label}</span></li>
            ))}
          </ul>

          <section ref={previewRef} className="card glass preview-card motion-rise" aria-label="Preview social">
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
