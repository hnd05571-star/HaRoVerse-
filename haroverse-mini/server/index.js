import 'dotenv/config';
import http from 'node:http';
import express from 'express';
import cors from 'cors';
import session from 'express-session';
import connectPg from 'connect-pg-simple';
import bcrypt from 'bcryptjs';
import { Server } from 'socket.io';
import { pool, q } from './db.js';

const PgStore = connectPg(session);
const app = express();
const server = http.createServer(app);
const PORT = process.env.PORT || 4000;
const ORIGIN = process.env.CLIENT_ORIGIN || 'http://localhost:5173';

app.use(cors({ origin: ORIGIN, credentials: true }));
app.use(express.json());
app.use(
  session({
    name: 'hrv.sid',
    store: new PgStore({ pool, tableName: 'sessions', createTableIfMissing: false }),
    secret: process.env.SESSION_SECRET || 'dev-secret-change-me',
    resave: false,
    saveUninitialized: false,
    cookie: { httpOnly: true, sameSite: 'lax', maxAge: 1000 * 60 * 60 * 24 * 7 },
  })
);

// ── Auth middleware ──────────────────────────────────────
app.use(async (req, _res, next) => {
  req.user = null;
  if (!req.session?.userId) return next();
  const { rows } = await q(
    `SELECT u.id, u.username, u.email, u.role, u.avatar_url, u.status,
            p.display_name, p.bio, p.custom_status
       FROM users u LEFT JOIN profiles p ON p.user_id = u.id
      WHERE u.id = $1`,
    [req.session.userId]
  );
  req.user = rows[0] || null;
  next();
});

const auth = (req, res, next) =>
  req.user ? next() : res.status(401).json({ error: 'Not authenticated' });

// ── Routes ───────────────────────────────────────────────

app.get('/api/health', (_req, res) => res.json({ ok: true }));

app.post('/api/auth/login', async (req, res) => {
  const { identifier, password } = req.body || {};
  if (!identifier || !password) return res.status(400).json({ error: 'Missing fields' });

  const { rows } = await q(
    `SELECT u.*, p.display_name FROM users u
     LEFT JOIN profiles p ON p.user_id = u.id
     WHERE u.username = $1 OR u.email = $1 LIMIT 1`,
    [identifier]
  );
  const user = rows[0];
  if (!user || !(await bcrypt.compare(password, user.password_hash))) {
    return res.status(401).json({ error: 'Invalid credentials' });
  }
  if (user.is_disabled) return res.status(403).json({ error: 'Account disabled' });

  req.session.userId = user.id;
  await q(`UPDATE users SET status='online', last_seen=NOW() WHERE id=$1`, [user.id]);

  res.json({
    user: {
      id: user.id, username: user.username, email: user.email,
      role: user.role, avatarUrl: user.avatar_url,
      displayName: user.display_name, status: 'online',
    },
  });
});

app.post('/api/auth/logout', async (req, res) => {
  if (req.user) await q(`UPDATE users SET status='offline' WHERE id=$1`, [req.user.id]);
  req.session.destroy(() => res.json({ ok: true }));
});

app.get('/api/auth/me', (req, res) => {
  if (!req.user) return res.status(401).json({ error: 'Not logged in' });
  res.json({ user: req.user });
});

app.post('/api/auth/register', async (req, res) => {
  const { code, username, email, displayName, password } = req.body || {};
  if (!code || !username || !email || !password)
    return res.status(400).json({ error: 'Missing fields' });
  if (password.length < 8)
    return res.status(400).json({ error: 'Password too short (min 8)' });

  const { rows: inv } = await q(`SELECT * FROM invitations WHERE code=$1`, [code.toUpperCase()]);
  const invite = inv[0];
  if (!invite || invite.status !== 'ACTIVE' || invite.used_count >= invite.max_uses)
    return res.status(400).json({ error: 'Invalid or used invite code' });

  const hash = await bcrypt.hash(password, 12);
  try {
    const { rows } = await q(
      `INSERT INTO users (username, email, password_hash, role, status)
       VALUES ($1, $2, $3, 'member', 'online') RETURNING id`,
      [username, email, hash]
    );
    const uid = rows[0].id;
    await q(`INSERT INTO profiles (user_id, display_name) VALUES ($1, $2)`, [uid, displayName || username]);
    await q(`UPDATE invitations SET used_count = used_count + 1,
             status = CASE WHEN used_count + 1 >= max_uses THEN 'USED' ELSE 'ACTIVE' END
             WHERE id = $1`, [invite.id]);

    req.session.userId = uid;
    res.json({ user: { id: uid, username, email, role: 'member', displayName: displayName || username } });
  } catch (e) {
    if (e.code === '23505') return res.status(409).json({ error: 'Username or email taken' });
    throw e;
  }
});

app.get('/api/users', auth, async (_req, res) => {
  const { rows } = await q(
    `SELECT u.id, u.username, u.role, u.avatar_url, u.status,
            p.display_name, p.bio, p.custom_status
       FROM users u LEFT JOIN profiles p ON p.user_id = u.id
      WHERE u.is_disabled = FALSE
      ORDER BY CASE u.role WHEN 'founder' THEN 0 ELSE 1 END, p.display_name`
  );
  res.json({ users: rows });
});

app.patch('/api/users/me', auth, async (req, res) => {
  const { displayName, bio, customStatus } = req.body || {};
  if (displayName || bio !== undefined || customStatus !== undefined) {
    await q(
      `UPDATE profiles SET
        display_name = COALESCE($1, display_name),
        bio = COALESCE($2, bio),
        custom_status = COALESCE($3, custom_status)
       WHERE user_id = $4`,
      [displayName, bio, customStatus, req.user.id]
    );
  }
  res.json({ ok: true });
});

app.get('/api/rooms', auth, async (_req, res) => {
  const { rows } = await q(`SELECT * FROM chat_rooms ORDER BY slug`);
  res.json({ rooms: rows });
});

app.get('/api/rooms/:slug/messages', auth, async (req, res) => {
  const { rows } = await q(
    `SELECT m.id, m.content, m.created_at, m.user_id,
            u.username, u.avatar_url, u.role,
            p.display_name
       FROM messages m
       JOIN users u ON u.id = m.user_id
       JOIN chat_rooms r ON r.id = m.room_id
       LEFT JOIN profiles p ON p.user_id = m.user_id
      WHERE r.slug = $1
      ORDER BY m.created_at ASC LIMIT 100`,
    [req.params.slug]
  );
  res.json({ messages: rows });
});

app.get('/api/stats', auth, async (_req, res) => {
  const { rows } = await q(`
    SELECT
      (SELECT COUNT(*)::int FROM users WHERE is_disabled = FALSE) AS members,
      (SELECT COUNT(*)::int FROM users WHERE status='online') AS online,
      (SELECT COUNT(*)::int FROM messages) AS messages,
      (SELECT EXTRACT(DAY FROM NOW() - COALESCE(MIN(created_at), NOW()))::int FROM users) AS days
  `);
  res.json({ stats: rows[0] });
});

// ── Socket.IO ────────────────────────────────────────────
const sessionMw = session({
  name: 'hrv.sid',
  store: new PgStore({ pool, tableName: 'sessions', createTableIfMissing: false }),
  secret: process.env.SESSION_SECRET || 'dev-secret-change-me',
  resave: false,
  saveUninitialized: false,
});

const io = new Server(server, { cors: { origin: ORIGIN, credentials: true } });
io.engine.use(sessionMw);

io.use(async (socket, next) => {
  const uid = socket.request.session?.userId;
  if (!uid) return next(new Error('unauthorized'));
  const { rows } = await q(
    `SELECT u.id, u.username, u.role, u.avatar_url, p.display_name
       FROM users u LEFT JOIN profiles p ON p.user_id = u.id WHERE u.id = $1`,
    [uid]
  );
  if (!rows[0]) return next(new Error('unauthorized'));
  socket.user = rows[0];
  next();
});

io.on('connection', (socket) => {
  socket.join('universe');

  socket.on('room:join', (slug) => {
    for (const r of socket.rooms) if (r !== socket.id && r !== 'universe') socket.leave(r);
    socket.join(`room:${slug}`);
  });

  socket.on('message:send', async ({ slug, content }, ack) => {
    try {
      if (!content?.trim()) return ack?.({ error: 'empty' });
      const { rows: room } = await q(`SELECT id FROM chat_rooms WHERE slug=$1`, [slug]);
      if (!room[0]) return ack?.({ error: 'no room' });

      const { rows } = await q(
        `INSERT INTO messages (room_id, user_id, content) VALUES ($1,$2,$3)
         RETURNING id, created_at`,
        [room[0].id, socket.user.id, content.trim().slice(0, 4000)]
      );

      const msg = {
        id: rows[0].id, content: content.trim().slice(0, 4000),
        created_at: rows[0].created_at,
        user_id: socket.user.id,
        username: socket.user.username,
        display_name: socket.user.display_name,
        avatar_url: socket.user.avatar_url,
        role: socket.user.role,
      };
      io.to(`room:${slug}`).emit('message:new', msg);
      ack?.({ ok: true });
    } catch (e) { ack?.({ error: 'server' }); }
  });

  socket.on('disconnect', async () => {
    await q(`UPDATE users SET status='offline' WHERE id=$1`, [socket.user.id]);
    io.to('universe').emit('presence', { userId: socket.user.id, status: 'offline' });
  });
});

server.listen(PORT, () => console.log(`\n🌌  API on :${PORT}\n`));
