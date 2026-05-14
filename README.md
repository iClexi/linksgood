# Linksgood

Acortador, alargador y generador QR para `links.iclexi.tech`.

## Principios

- No hace tracking oculto.
- Los enlaces y QR redirigen directamente al destino.
- La analítica visible para el creador se limita a datos básicos del request descritos en términos y privacidad.
- Login/register es opcional; una cuenta añade historial y sesiones, no bloquea el uso rápido.
- Los secretos viven fuera del repo, en `/etc/links/links.env` o `/root/.secrets/`.

## Desarrollo

```bash
npm install
LINKS_DATABASE_URL=postgresql://... npm start
```

Puerto por defecto: `9827`.

## Variables

Ver `.env.example`.
