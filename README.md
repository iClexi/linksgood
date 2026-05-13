# Linksgood

Acortador y alargador de enlaces para `links.iclexi.tech`.

## Principios

- No hace tracking oculto.
- Los enlaces muestran una pantalla de consentimiento antes de redirigir.
- La analítica visible para el creador se registra sólo cuando la persona acepta continuar.
- Los secretos viven fuera del repo, en `/etc/links/links.env` o `/root/.secrets/`.

## Desarrollo

```bash
npm install
LINKS_DATABASE_URL=postgresql://... npm start
```

Puerto por defecto: `9827`.

## Variables

Ver `.env.example`.
