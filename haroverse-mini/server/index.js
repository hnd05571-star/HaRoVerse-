import 'dotenv/config';
import http from 'node:http';
import crypto from 'node:crypto';
import express from 'express';
import cors from 'cors';
import session from 'express-session';
import bcrypt from 'bcryptjs';
import { Server } from 'socket.io';

const PORT = process.env.PORT || 4000;
const ORIGIN = process.env.CLIENT_ORIGIN || 'http://localhost:5173';

// ═══ IN-MEMORY STORE (testing only — resets on restart) ═══
const db = {
  users: new Map(),
  profiles: new Map(),
  invitations: new Map(),
  messages: [],
};

const rooms = [
  { id: 'r1', slug: 'general',    name: 'General',    icon: '🌌' },
  { id: 'r2', slug: 'random',     name: 'Random',     icon: '🎲' },
  { id: 'r3', slug: 'late-night', name: 'Late Night', icon: '🌙' },
];

// Seed founder + invite
const founderId = crypto.randomUUID();
db.users.set(founderId, {
  id: founderId,
  username: 'haro',
  email: 'founder@haroverse.local',
  password_hash: bcrypt.hashSync('HarOVerse!2026', 10),
  role: 'founder',
  avatar_url: null,
  status: 'online',
  is_disabled: false,
  created_at: new Date().toISOString(),
  last_seen: new Date().toISOString(),
});
db.profiles.set(founderId, {
  user_id: founderId,
  display_name: 'HaRo',
  bio: '',
  custom_status: 'building a universe.',
});
db.invitations.set('HRV-FIRST-KEY', {
  code: 'HRV-FIRST-KEY',
  created_by: founderId,
  max_uses: 10,
  used_count: 0,
  status: 'ACTIVE',
});

// ═══ EXPRESS ═══
const app = express();
const server = http.createServer(app);

app.use(cors({ origin: ORIGIN, credentials: true }));
app.use(express.json());

const sessionMiddleware = session({
  name: 'hrv.sid',
  secret: process.env.SESSION_SECRET || 'dev-secret-change-me',
  resave: false,
  saveUninitialized: false,
  cookie: { httpOnly: true, sameSite: 'lax', maxAge: 1000 * 60 * 60 * 24 * 7 },
});
app.use(sessionMiddleware);

app.use((req, _res, next) => {
  req.user = null;
  if (req.session?.userId) {
    const u = db.users.get(req.session.userId);
    if (u && !u.is_disabled) {
      const p = db.profiles.get(u.id) || {};
      req.user = {
        id: u.id, username: u.username, email: u.email,
        role: u.role, avatarUrl: u.avatar_url, status: u.status,
        displayName: p.display_name, bio: p.bio || '',
        custom_status: p.custom_status || '',
      };
    }
  }
  next();
});

const auth = (req, res, next) =>
  req.user ? next() : res.status(401).json({ error: 'Not authenticated' });

// ═══ ROUTES ═══
app.get('/api/health', (_req, res) => res.json({ ok: true }));

app.post('/api/auth/login', async (req, res) => {
  const { identifier, password } = req.body || {};
  if (!identifier || !password) return res.status(400).json({ error: 'Missing fields' });

  const user = [...db.users.values()].find(
    (u) => u.username === identifier.toLowerCase() || u.email === identifier.toLowerCase()
  );
  if (!user || !(await bcrypt.compare(password, user.password_hash))) {
    return res.status(401).json({ error: 'Invalid credentials' });
  }
  if (user.is_disabled) return res.status(403).json({ error: 'Account disabled' });

  user.status = 'online';
  user.last_seen = new Date().toISOString();
  req.session.userId = user.id;

  const p = db.profiles.get(user.id) || {};
  res.json({
    user: {
      id: user.id, username: user.username, email: user.email,
      role: user.role, avatarUrl: user.avatar_url, status: 'online',
      displayName: p.display_name, bio: p.bio || '',
    },
  });
});

app.post('/api/auth/logout', (req, res) => {
  if (req.user) {
    const u = db.users.get(req.user.id);
    if (u) u.status = 'offline';
  }
  req.session.destroy(() => res.json({ ok: true }));
});

app.get('/api/auth/me', (req, res) => {
  if (!req.user) return res.status(401).json({ error: 'Not logged in' });
  res.json({ user: req.user });
});

app.post('/api/auth/register', async (req, res) => {
  const { code, username, email, displayName, password } = req.body || {};
  if (!code || !username || !email || !password) {
    return res.status(400).json({ error: 'Missing fields' });
  }
  if (password.length < 8) {
    return res.status(400).json({ error: 'Password too short (min 8)' });
  }

  const invite = db.invitations.get(code.toUpperCase());
  if (!invite || invite.status !== 'ACTIVE' || invite.used_count >= invite.max_uses) {
    return res.status(400).json({ error: 'Invalid or used invite code' });
  }

  const taken = [...db.users.values()].some(
    (u) => u.username === username.toLowerCase() || u.email === email.toLowerCase()
  );
  if (taken) return res.status(409).json({ error: 'Username or email taken' });

  const hash = await bcrypt.hash(password, 10);
  const id = crypto.randomUUID();
  db.users.set(id, {
    id,
    username: username.toLowerCase(),
    email: email.toLowerCase(),
    password_hash: hash,
    role: 'member',
    avatar_url: null,
    status: 'online',
    is_disabled: false,
    created_at: new Date().toISOString(),
    last_seen: new Date().toISOString(),
  });
  db.profiles.set(id, {
    user_id: id,
    display_name: displayName || username,
    bio: '',
    custom_status: '',
  });

  invite.used_count++;
  if (invite.used_count >= invite.max_uses) invite.status = 'USED';

  req.session.userId = id;
  res.json({
    user: {
      id, username: username.toLowerCase(), email: email.toLowerCase(),
      role: 'member', displayName: displayName || username,
    },
  });
});

app.get('/api/users', auth, (_req, res) => {
  const users = [...db.users.values()]
    .filter((u) => !u.is_disabled)
    .map((u) => {
      const p = db.profiles.get(u.id) || {};
      return {
        id: u.id, username: u.username, role: u.role,
        avatar_url: u.avatar_url, status: u.status,
        display_name: p.display_name,
        bio: p.bio || '',
        custom_status: p.custom_status || '',
      };
    })
    .sort((a, b) => {
      if (a.role === 'founder') return -1;
      if (b.role === 'founder') return 1;
      return (a.display_name || '').localeCompare(b.display_name || '');
    });
  res.json({ users });
});

app.patch('/api/users/me', auth, (req, res) => {
  const { displayName, bio, customStatus } = req.body || {};
  const p = db.profiles.get(req.user.id) || { user_id: req.user.id };
  if (displayName !== undefined) p.display_name = displayName;
  if (bio !== undefined) p.bio = bio;
  if (customStatus !== undefined) p.custom_status = customStatus;
  db.profiles.set(req.user.id, p);
  res.json({ ok: true });
});

app.get('/api/rooms', auth, (_req, res) => res.json({ rooms }));

app.get('/api/rooms/:slug/messages', auth, (req, res) => {
  const room = rooms.find((r) => r.slug === req.params.slug);
  if (!room) return res.status(404).json({ error: 'No such room' });

  const list = db.messages
    .filter((m) => m.room_id === room.id)
    .map((m) => {
      const u = db.users.get(m.user_id) || {};
      const p = db.profiles.get(m.user_id) || {};
      return {
        id: m.id, content: m.content, created_at: m.created_at,
        user_id: m.user_id,
        username: u.username, avatar_url: u.avatar_url, role: u.role,
        display_name: p.display_name,
      };
    });
  res.json({ messages: list });
});

app.get('/api/stats', auth, (_req, res) => {
  const members = [...db.users.values()].filter((u) => !u.is_disabled).length;
  const online = [...db.users.values()].filter((u) => u.status === 'online').length;
  const messages = db.messages.length;
  const first = [...db.users.values()].reduce(
    (min, u) => Math.min(min, new Date(u.created_at).getTime()),
    Date.now()
  );
  const days = Math.max(1, Math.ceil((Date.now() - first) / 86400000));
  res.json({ stats: { members, online, messages, days } });
});

// ═══ SOCKET.IO ═══
const io = new Server(server, { cors: { origin: ORIGIN, credentials: true } });
io.engine.use(sessionMiddleware);

io.use((socket, next) => {
  const uid = socket.request.session?.userId;
  const u = uid && db.users.get(uid);
  if (!u || u.is_disabled) return next(new Error('unauthorized'));
  const p = db.profiles.get(u.id) || {};
  socket.user = {
    id: u.id, username: u.username, role: u.role,
    avatar_url: u.avatar_url,
    display_name: p.display_name,
  };
  next();
});

io.on('connection', (socket) => {
  socket.join('universe');

  socket.on('room:join', (slug) => {
    for (const r of socket.rooms) {
      if (r !== socket.id && r !== 'universe') socket.leave(r);
    }
    socket.join(`room:${slug}`);
  });

  socket.on('message:send', ({ slug, content }, ack) => {
    if (!content?.trim()) return ack?.({ error: 'empty' });
    const room = rooms.find((r) => r.slug === slug);
    if (!room) return ack?.({ error: 'no room' });

    const msg = {
      id: crypto.randomUUID(),
      room_id: room.id,
      user_id: socket.user.id,
      content: content.trim().slice(0, 4000),
      created_at: new Date().toISOString(),
      username: socket.user.username,
      display_name: socket.user.display_name,
      avatar_url: socket.user.avatar_url,
      role: socket.user.role,
    };
    db.messages.push(msg);
    if (db.messages.length > 500) db.messages.shift();

    io.to(`room:${slug}`).emit('message:new', msg);
    ack?.({ ok: true });
  });

  socket.on('disconnect', () => {
    const u = db.users.get(socket.user.id);
    if (u) u.status = 'offline';
    io.to('universe').emit('presence', { userId: socket.user.id, status: 'offline' });
  });
});

// ═══ START ═══
server.listen(PORT, () => {
  console.log(`\n🌌  HaRoVerse API on :${PORT}`);
  console.log(`   Founder: founder@haroverse.local / HarOVerse!2026`);
  console.log(`   Invite : HRV-FIRST-KEY (10 uses)\n`);
});
