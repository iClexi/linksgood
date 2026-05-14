CREATE TABLE IF NOT EXISTS users (
    id uuid PRIMARY KEY,
    username text NOT NULL,
    email text NOT NULL,
    email_normalized text NOT NULL UNIQUE,
    password_hash text NOT NULL,
    password_salt text NOT NULL,
    password_iterations integer NOT NULL DEFAULT 210000,
    role text NOT NULL DEFAULT 'user',
    created_ip text NOT NULL DEFAULT '',
    created_user_agent text NOT NULL DEFAULT '',
    created_at timestamptz NOT NULL DEFAULT now(),
    updated_at timestamptz NOT NULL DEFAULT now()
);

CREATE UNIQUE INDEX IF NOT EXISTS users_username_lower_idx ON users (lower(username));
CREATE INDEX IF NOT EXISTS users_created_at_idx ON users (created_at DESC);

CREATE TABLE IF NOT EXISTS user_sessions (
    id uuid PRIMARY KEY,
    user_id uuid NOT NULL REFERENCES users(id) ON DELETE CASCADE,
    token_hash text NOT NULL UNIQUE,
    device_label text NOT NULL DEFAULT '',
    ip text NOT NULL DEFAULT '',
    user_agent text NOT NULL DEFAULT '',
    created_at timestamptz NOT NULL DEFAULT now(),
    last_seen_at timestamptz NOT NULL DEFAULT now(),
    expires_at timestamptz NOT NULL,
    revoked_at timestamptz
);

CREATE INDEX IF NOT EXISTS user_sessions_user_id_idx ON user_sessions (user_id, created_at DESC);
CREATE INDEX IF NOT EXISTS user_sessions_token_hash_idx ON user_sessions (token_hash);

CREATE TABLE IF NOT EXISTS user_events (
    id bigserial PRIMARY KEY,
    user_id uuid REFERENCES users(id) ON DELETE SET NULL,
    event_type text NOT NULL,
    entity_type text NOT NULL DEFAULT '',
    entity_id text NOT NULL DEFAULT '',
    ip text NOT NULL DEFAULT '',
    user_agent text NOT NULL DEFAULT '',
    details jsonb NOT NULL DEFAULT '{}'::jsonb,
    created_at timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS user_events_user_id_idx ON user_events (user_id, created_at DESC);
CREATE INDEX IF NOT EXISTS user_events_created_at_idx ON user_events (created_at DESC);

CREATE TABLE IF NOT EXISTS links (
    id uuid PRIMARY KEY,
    user_id uuid REFERENCES users(id) ON DELETE SET NULL,
    alias_path text NOT NULL UNIQUE,
    mode text NOT NULL CHECK (mode IN ('short', 'long')),
    target_url text NOT NULL,
    target_host text NOT NULL,
    owner_key_hash text NOT NULL,
    owner_label text NOT NULL DEFAULT '',
    meta_title text NOT NULL DEFAULT '',
    meta_description text NOT NULL DEFAULT '',
    meta_image text NOT NULL DEFAULT '',
    created_ip text NOT NULL DEFAULT '',
    created_user_agent text NOT NULL DEFAULT '',
    active boolean NOT NULL DEFAULT true,
    clicks integer NOT NULL DEFAULT 0,
    created_at timestamptz NOT NULL DEFAULT now(),
    updated_at timestamptz NOT NULL DEFAULT now()
);

ALTER TABLE links ADD COLUMN IF NOT EXISTS user_id uuid REFERENCES users(id) ON DELETE SET NULL;

CREATE INDEX IF NOT EXISTS links_created_at_idx ON links (created_at DESC);
CREATE INDEX IF NOT EXISTS links_owner_key_hash_idx ON links (owner_key_hash);
CREATE INDEX IF NOT EXISTS links_user_id_idx ON links (user_id, created_at DESC);

CREATE TABLE IF NOT EXISTS link_visits (
    id bigserial PRIMARY KEY,
    link_id uuid NOT NULL REFERENCES links(id) ON DELETE CASCADE,
    visited_at timestamptz NOT NULL DEFAULT now(),
    source text NOT NULL DEFAULT 'link',
    consented boolean NOT NULL DEFAULT true,
    ip text NOT NULL DEFAULT '',
    public_ip text NOT NULL DEFAULT '',
    user_agent text NOT NULL DEFAULT '',
    referer text NOT NULL DEFAULT '',
    accept_language text NOT NULL DEFAULT '',
    browser jsonb NOT NULL DEFAULT '{}'::jsonb,
    server jsonb NOT NULL DEFAULT '{}'::jsonb
);

ALTER TABLE link_visits ADD COLUMN IF NOT EXISTS source text NOT NULL DEFAULT 'link';

CREATE INDEX IF NOT EXISTS link_visits_link_id_idx ON link_visits (link_id, visited_at DESC);
CREATE INDEX IF NOT EXISTS link_visits_visited_at_idx ON link_visits (visited_at DESC);
CREATE INDEX IF NOT EXISTS link_visits_source_idx ON link_visits (source, visited_at DESC);

CREATE TABLE IF NOT EXISTS blocked_ips (
    ip text PRIMARY KEY,
    reason text NOT NULL DEFAULT '',
    blocked_by text NOT NULL DEFAULT '',
    created_at timestamptz NOT NULL DEFAULT now()
);
