import 'dotenv/config';
import pg from 'pg';
import bcrypt from 'bcryptjs';

const { Pool } = pg;

export const pool = new Pool({
  connectionString:
    process.env.DATABASE_URL || 'postgres://postgres:postgres@localhost:5432/haroverse',
});

export const q = (text, params) => pool.query(text, params);

// ── Schema ───────────────────────────────────────────────
const SCHEMA = `
CREATE EXTENSION IF NOT EXISTS "pgcrypto";
CREATE EXTENSION IF NOT EXISTS "citext";

CREATE TABLE IF NOT EXISTS users (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  username CITEXT UNIQUE NOT NULL,
  email CITEXT UNIQUE NOT NULL,
  password_hash TEXT NOT NULL,
  role TEXT NOT NULL DEFAULT 'member',
  avatar_url TEXT,
  status TEXT NOT NULL DEFAULT 'offline',
  is_disabled BOOLEAN NOT NULL DEFAULT FALSE,
  created_at TIMESTAMPTZ DEFAULT NOW(),
  last_seen TIMESTAMPTZ DEFAULT NOW()
);

CREATE TABLE IF NOT EXISTS profiles (
  user_id UUID PRIMARY KEY REFERENCES users(id) ON DELETE CASCADE,
  display_name TEXT NOT NULL,
  bio TEXT DEFAULT '',
  custom_status TEXT DEFAULT '',
  cosmic_theme TEXT DEFAULT 'violet'
);

CREATE TABLE IF NOT EXISTS sessions (
  sid VARCHAR PRIMARY KEY,
  sess JSON NOT NULL,
  expire TIMESTAMP(6) NOT NULL
);

CREATE TABLE IF NOT EXISTS invitations (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  code TEXT UNIQUE NOT NULL,
  created_by UUID REFERENCES users(id) ON DELETE SET NULL,
  max_uses INTEGER DEFAULT 1,
  used_count INTEGER DEFAULT 0,
  status TEXT DEFAULT 'ACTIVE',
  expires_at TIMESTAMPTZ,
  created_at TIMESTAMPTZ DEFAULT NOW()
);

CREATE TABLE IF NOT EXISTS chat_rooms (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  slug TEXT UNIQUE NOT NULL,
  name TEXT NOT NULL,
  icon TEXT DEFAULT '💬'
);

INSERT INTO chat_rooms (slug, name, icon) VALUES
  ('general', 'General', '🌌'),
  ('random', 'Random', '🎲'),
  ('late-night', 'Late Night', '🌙')
ON CONFLICT DO NOTHING;

CREATE TABLE IF NOT EXISTS messages (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  room_id UUID REFERENCES chat_rooms(id) ON DELETE CASCADE,
  user_id UUID REFERENCES users(id) ON DELETE CASCADE,
  content TEXT NOT NULL,
  created_at TIMESTAMPTZ DEFAULT NOW()
);
`;

// ── Init script ──────────────────────────────────────────
async function init() {
  console.log('→ Creating tables…');
  await pool.query(SCHEMA);
  console.log('✓ Tables ready.');

  const hash = await bcrypt.hash('HarOVerse!2026', 12);
  const { rows } = await pool.query(
    `INSERT INTO users (username, email, password_hash, role, status)
     VALUES ('haro', 'founder@haroverse.local', $1, 'founder', 'online')
     ON CONFLICT (email) DO UPDATE SET password_hash = EXCLUDED.password_hash
     RETURNING id`,
    [hash]
  );
  const founderId = rows[0].id;

  await pool.query(
    `INSERT INTO profiles (user_id, display_name, custom_status)
     VALUES ($1, 'HaRo', 'building a universe.')
     ON CONFLICT (user_id) DO NOTHING`,
    [founderId]
  );

  await pool.query(
    `INSERT INTO invitations (code, created_by, max_uses, expires_at)
     VALUES ('HRV-FIRST-KEY', $1, 10, NOW() + interval '365 days')
     ON CONFLICT (code) DO NOTHING`,
    [founderId]
  );

  console.log('✓ Founder created');
  console.log('  email:    founder@haroverse.local');
  console.log('  password: HarOVerse!2026');
  console.log('✓ Invite:   HRV-FIRST-KEY (10 uses)\n');
  await pool.end();
}

if (import.meta.url === `file://${process.argv[1]}`) {
  init().catch((e) => { console.error(e); process.exit(1); });
}
