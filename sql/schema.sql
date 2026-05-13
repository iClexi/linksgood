CREATE TABLE IF NOT EXISTS links (
    id uuid PRIMARY KEY,
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

CREATE INDEX IF NOT EXISTS links_created_at_idx ON links (created_at DESC);
CREATE INDEX IF NOT EXISTS links_owner_key_hash_idx ON links (owner_key_hash);

CREATE TABLE IF NOT EXISTS link_visits (
    id bigserial PRIMARY KEY,
    link_id uuid NOT NULL REFERENCES links(id) ON DELETE CASCADE,
    visited_at timestamptz NOT NULL DEFAULT now(),
    consented boolean NOT NULL DEFAULT true,
    ip text NOT NULL DEFAULT '',
    public_ip text NOT NULL DEFAULT '',
    user_agent text NOT NULL DEFAULT '',
    referer text NOT NULL DEFAULT '',
    accept_language text NOT NULL DEFAULT '',
    browser jsonb NOT NULL DEFAULT '{}'::jsonb,
    server jsonb NOT NULL DEFAULT '{}'::jsonb
);

CREATE INDEX IF NOT EXISTS link_visits_link_id_idx ON link_visits (link_id, visited_at DESC);
CREATE INDEX IF NOT EXISTS link_visits_visited_at_idx ON link_visits (visited_at DESC);

CREATE TABLE IF NOT EXISTS blocked_ips (
    ip text PRIMARY KEY,
    reason text NOT NULL DEFAULT '',
    blocked_by text NOT NULL DEFAULT '',
    created_at timestamptz NOT NULL DEFAULT now()
);
