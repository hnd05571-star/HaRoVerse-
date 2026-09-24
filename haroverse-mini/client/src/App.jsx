import { createContext, useContext, useEffect, useState } from 'react';
import { Routes, Route, Navigate, Link, useNavigate, useParams } from 'react-router-dom';
import { motion, AnimatePresence } from 'framer-motion';
import axios from 'axios';
import { io } from 'socket.io-client';

const api = axios.create({ baseURL: '/api', withCredentials: true });

// ─── Auth Context ───────────────────────────────────────
const AuthCtx = createContext(null);
const useAuth = () => useContext(AuthCtx);

function AuthProvider({ children }) {
  const [user, setUser] = useState(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    api.get('/auth/me')
      .then(({ data }) => setUser(data.user))
      .catch(() => {})
      .finally(() => setLoading(false));
  }, []);

  const login = async (identifier, password) => {
    const { data } = await api.post('/auth/login', { identifier, password });
    setUser(data.user);
  };
  const register = async (payload) => {
    const { data } = await api.post('/auth/register', payload);
    setUser(data.user);
  };
  const logout = async () => {
    await api.post('/auth/logout').catch(() => {});
    setUser(null);
  };

  return (
    <AuthCtx.Provider value={{ user, setUser, loading, login, register, logout }}>
      {children}
    </AuthCtx.Provider>
  );
}

// ─── Background ─────────────────────────────────────────
function Cosmos() {
  return (
    <div className="cosmos">
      <div className="nebula nebula-a" />
      <div className="nebula nebula-b" />
      <div className="stars" />
      <div className="vignette" />
    </div>
  );
}

// ─── Loader ─────────────────────────────────────────────
function Loader({ label = 'Connecting to the universe…' }) {
  return (
    <div className="loader">
      <div className="orbit">
        <div className="orbit-ring" />
        <div className="orbit-spin"><div className="orbit-planet" /></div>
        <div className="orbit-core">H</div>
      </div>
      <div className="loader-text">{label}</div>
    </div>
  );
}

// ─── Landing ────────────────────────────────────────────
function Landing() {
  const nav = useNavigate();
  const [leaving, setLeaving] = useState(false);
  const go = () => { setLeaving(true); setTimeout(() => nav('/login'), 650); };

  return (
    <motion.div
      className="landing"
      initial={{ opacity: 0 }}
      animate={leaving ? { opacity: 0, scale: 1.15, filter: 'blur(24px)' } : { opacity: 1 }}
      transition={{ duration: 0.65, ease: [0.22, 1, 0.36, 1] }}
    >
      <motion.h1
        className="wordmark"
        initial={{ opacity: 0, letterSpacing: '0.4em' }}
        animate={{ opacity: 1, letterSpacing: '-0.05em' }}
        transition={{ duration: 1.6, ease: [0.22, 1, 0.36, 1] }}
      >
        <span className="grad">HA RO</span>
        <span className="grad" style={{ marginLeft: '0.5em' }}>VERSE</span>
      </motion.h1>

      <motion.p
        className="tagline"
        initial={{ opacity: 0, y: 12 }}
        animate={{ opacity: 1, y: 0 }}
        transition={{ delay: 0.9, duration: 0.9 }}
      >
        Our universe. Our people.
      </motion.p>

      <motion.button
        className="enter-btn"
        onClick={go}
        initial={{ opacity: 0, y: 20 }}
        animate={{ opacity: 1, y: 0 }}
        transition={{ delay: 1.3, duration: 0.7 }}
        whileHover={{ scale: 1.05 }}
        whileTap={{ scale: 0.97 }}
      >
        Enter the universe
      </motion.button>

      <div className="foot">Not everyone belongs in our universe.</div>
    </motion.div>
  );
}

// ─── Login ──────────────────────────────────────────────
function Login() {
  const { login } = useAuth();
  const nav = useNavigate();
  const [identifier, setIdentifier] = useState('');
  const [password, setPassword] = useState('');
  const [error, setError] = useState('');
  const [busy, setBusy] = useState(false);

  const submit = async (e) => {
    e.preventDefault();
    setError(''); setBusy(true);
    try {
      await login(identifier, password);
      nav('/');
    } catch (err) {
      setError(err?.response?.data?.error || 'Login failed');
    } finally { setBusy(false); }
  };

  return (
    <motion.div className="auth-wrap" initial={{ opacity: 0, y: 20 }} animate={{ opacity: 1, y: 0 }}>
      <form onSubmit={submit} className="glass auth-card">
        <div className="logo-row"><span className="orb">H</span><span>HaRo<span style={{color:'var(--violet)'}}>Verse</span></span></div>
        <div className="eyebrow">PRIVATE ENTRY</div>
        <h2>Welcome back to the universe</h2>

        <label className="field">
          <span>Username or email</span>
          <input value={identifier} onChange={(e) => setIdentifier(e.target.value)} autoFocus required />
        </label>
        <label className="field">
          <span>Password</span>
          <input type="password" value={password} onChange={(e) => setPassword(e.target.value)} required />
        </label>

        {error && <p className="err">{error}</p>}

        <button className="btn btn-primary" disabled={busy}>
          {busy ? 'Opening…' : 'Enter the universe'}
        </button>

        <p className="dim small center">No account? <Link to="/invite">You need an invitation.</Link></p>
      </form>
      <Link to="/welcome" className="back-link">← Back</Link>
    </motion.div>
  );
}

// ─── Invite Register ────────────────────────────────────
function Invite() {
  const { register } = useAuth();
  const nav = useNavigate();
  const [form, setForm] = useState({ code: '', username: '', email: '', displayName: '', password: '' });
  const [error, setError] = useState('');
  const [busy, setBusy] = useState(false);

  const submit = async (e) => {
    e.preventDefault();
    setError(''); setBusy(true);
    try {
      await register({ ...form, code: form.code.toUpperCase() });
      nav('/');
    } catch (err) {
      setError(err?.response?.data?.error || 'Registration failed');
    } finally { setBusy(false); }
  };

  const upd = (k) => (e) => setForm({ ...form, [k]: e.target.value });

  return (
    <motion.div className="auth-wrap" initial={{ opacity: 0, y: 20 }} animate={{ opacity: 1, y: 0 }}>
      <form onSubmit={submit} className="glass auth-card">
        <div className="logo-row"><span className="orb">H</span><span>HaRo<span style={{color:'var(--violet)'}}>Verse</span></span></div>
        <div className="eyebrow">INVITATION REQUIRED</div>
        <h2>Create your identity</h2>

        <label className="field"><span>Invite code</span>
          <input value={form.code} onChange={upd('code')} placeholder="HRV-FIRST-KEY" required style={{ textAlign: 'center', letterSpacing: '0.15em' }} />
        </label>
        <label className="field"><span>Display name</span><input value={form.displayName} onChange={upd('displayName')} required /></label>
        <label className="field"><span>Username</span><input value={form.username} onChange={(e) => setForm({ ...form, username: e.target.value.toLowerCase() })} required /></label>
        <label className="field"><span>Email</span><input type="email" value={form.email} onChange={upd('email')} required /></label>
        <label className="field"><span>Password (min 8 chars)</span><input type="password" value={form.password} onChange={upd('password')} required /></label>

        {error && <p className="err">{error}</p>}
        <button className="btn btn-primary" disabled={busy}>{busy ? 'Creating…' : 'Enter HaRoVerse'}</button>
        <p className="dim small center">Have an account? <Link to="/login">Log in</Link></p>
      </form>
    </motion.div>
  );
}

// ─── Nav ────────────────────────────────────────────────
function Nav() {
  const { user, logout } = useAuth();
  const nav = useNavigate();

  return (
    <nav className="sidenav glass">
      <div className="logo-row"><span className="orb">H</span><span>HaRo<span style={{color:'var(--violet)'}}>Verse</span></span></div>
      <Link to="/" className="nav-link">🏠 Home</Link>
      <Link to="/universe" className="nav-link">🌌 Universe</Link>
      <Link to="/rooms" className="nav-link">💬 Rooms</Link>
      <Link to="/profile" className="nav-link">👤 Profile</Link>
      <div style={{ flex: 1 }} />
      <div className="user-chip">
        <span className="mini-orb">{(user?.display_name || user?.username || '?').charAt(0).toUpperCase()}</span>
        <div><b>{user?.display_name || user?.username}</b><br /><span className="dim small">@{user?.username}</span></div>
      </div>
      <button className="btn btn-ghost" onClick={() => { logout(); nav('/login'); }}>Leave universe</button>
    </nav>
  );
}

function Layout({ children }) {
  return (
    <div className="app">
      <Nav />
      <main className="main">{children}</main>
    </div>
  );
}

// ─── Dashboard ──────────────────────────────────────────
function Dashboard() {
  const { user } = useAuth();
  const [stats, setStats] = useState(null);

  useEffect(() => { api.get('/stats').then(({ data }) => setStats(data.stats)).catch(() => {}); }, []);

  const greeting = (() => {
    const h = new Date().getHours();
    if (h < 5) return 'Still awake';
    if (h < 12) return 'Good morning';
    if (h < 18) return 'Good afternoon';
    if (h < 22) return 'Good evening';
    return 'Good night';
  })();

  return (
    <motion.div initial={{ opacity: 0, y: 14 }} animate={{ opacity: 1, y: 0 }} transition={{ duration: 0.5 }}>
      <div className="eyebrow">{new Date().toLocaleDateString(undefined, { weekday: 'long', day: 'numeric', month: 'long' })}</div>
      <h1 className="page-title">
        {greeting()}, <span className="grad">{user?.display_name || user?.username}</span>
      </h1>
      <p className="dim" style={{ marginBottom: 26 }}>Welcome back to HaRoVerse.</p>

      <div className="stat-grid">
        <StatCard v={stats?.members} l="Citizens" />
        <StatCard v={stats?.online} l="Online now" />
        <StatCard v={stats?.messages} l="Messages" />
        <StatCard v={stats?.days} l="Days alive" />
      </div>

      <div className="glass card" style={{ marginTop: 24 }}>
        <div className="eyebrow">Quick access</div>
        <div className="quick-grid">
          <Link to="/universe" className="quick">🌌 Universe</Link>
          <Link to="/rooms" className="quick">💬 Rooms</Link>
          <Link to="/profile" className="quick">👤 Profile</Link>
        </div>
      </div>
    </motion.div>
  );
}

function StatCard({ v, l }) {
  const [val, setVal] = useState(0);
  useEffect(() => {
    if (!v) return;
    const t0 = performance.now();
    const tick = (now) => {
      const p = Math.min((now - t0) / 1400, 1);
      const eased = 1 - Math.pow(2, -10 * p);
      setVal(Math.round(v * eased));
      if (p < 1) requestAnimationFrame(tick);
    };
    requestAnimationFrame(tick);
  }, [v]);
  return (
    <motion.div className="glass stat" initial={{ opacity: 0, y: 16 }} animate={{ opacity: 1, y: 0 }}>
      <div className="stat-val grad">{(val || 0).toLocaleString()}</div>
      <div className="stat-lbl">{l}</div>
    </motion.div>
  );
}

// ─── Universe ───────────────────────────────────────────
function Universe() {
  const [users, setUsers] = useState([]);
  const nav = useNavigate();

  useEffect(() => { api.get('/users').then(({ data }) => setUsers(data.users)).catch(() => {}); }, []);

  const founder = users.find((u) => u.role === 'founder');
  const others = users.filter((u) => u.id !== founder?.id);

  return (
    <motion.div initial={{ opacity: 0, scale: 1.05 }} animate={{ opacity: 1, scale: 1 }} transition={{ duration: 0.7 }}>
      <div className="eyebrow">THE MAP</div>
      <h1 className="page-title">The Universe</h1>
      <p className="dim" style={{ marginBottom: 20 }}>Every light is someone.</p>

      <div className="universe">
        {[62, 78, 92].map((r) => <div key={r} className="universe-ring" style={{ width: `${r}%`, height: `${r}%` }} />)}

        {founder && (
          <motion.button
            className={`planet planet-founder ${founder.status === 'online' ? 'planet-on' : ''}`}
            style={{ width: 90, height: 90 }}
            onClick={() => nav(`/profile/${founder.username}`)}
            whileHover={{ scale: 1.15 }}
            title={founder.display_name}
          >
            {(founder.display_name || founder.username).charAt(0)}
          </motion.button>
        )}

        {others.map((m, i) => {
          const ring = [30, 42, 52][i % 3];
          const size = [52, 44, 38][i % 3];
          const dur = [40, 60, 80][i % 3];
          const delay = -(i * 47) % dur;
          return (
            <div key={m.id} className="orbit-wrap" style={{ width: `${ring * 2}%`, height: `${ring * 2}%` }}>
              <motion.div
                className="orbit-rot"
                animate={{ rotate: 360 }}
                transition={{ duration: dur, repeat: Infinity, ease: 'linear', delay: delay - dur }}
              >
                <motion.button
                  className={`planet ${m.status === 'online' ? 'planet-on' : 'planet-off'}`}
                  style={{ width: size, height: size, top: -size / 2, left: `calc(50% - ${size / 2}px)` }}
                  onClick={() => nav(`/profile/${m.username}`)}
                  whileHover={{ scale: 1.2 }}
                  animate={{ rotate: -360 }}
                  transition={{ duration: dur, repeat: Infinity, ease: 'linear', delay: delay - dur }}
                  title={m.display_name}
                >
                  {(m.display_name || m.username).charAt(0)}
                </motion.button>
              </motion.div>
            </div>
          );
        })}
      </div>

      <div className="grid-2" style={{ marginTop: 26 }}>
        {users.map((u) => (
          <Link key={u.id} to={`/profile/${u.username}`} className="glass user-card">
            <span className={`mini-orb ${u.status === 'online' ? 'on' : ''}`}>
              {(u.display_name || u.username).charAt(0)}
            </span>
            <div className="grow">
              <b>{u.display_name || u.username}</b>
              <div className="dim small">@{u.username} · {u.status}</div>
            </div>
            {u.role === 'founder' && <span title="Founder">👑</span>}
          </Link>
        ))}
      </div>
    </motion.div>
  );
}

// ─── Rooms ──────────────────────────────────────────────
function Rooms() {
  const { user } = useAuth();
  const [rooms, setRooms] = useState([]);
  const [slug, setSlug] = useState('general');
  const [messages, setMessages] = useState([]);
  const [draft, setDraft] = useState('');
  const [socket, setSocket] = useState(null);

  useEffect(() => { api.get('/rooms').then(({ data }) => setRooms(data.rooms)).catch(() => {}); }, []);

  useEffect(() => {
    const s = io('/', { withCredentials: true });
    setSocket(s);
    return () => s.disconnect();
  }, []);

  useEffect(() => {
    if (!socket) return;
    socket.emit('room:join', slug);
    api.get(`/rooms/${slug}/messages`).then(({ data }) => setMessages(data.messages)).catch(() => {});

    const onNew = (m) => setMessages((prev) => prev.some((x) => x.id === m.id) ? prev : [...prev, m]);
    socket.on('message:new', onNew);
    return () => socket.off('message:new', onNew);
  }, [slug, socket]);

  const send = (e) => {
    e.preventDefault();
    if (!draft.trim() || !socket) return;
    socket.emit('message:send', { slug, content: draft.trim() }, () => {});
    setDraft('');
  };

  return (
    <motion.div initial={{ opacity: 0, y: 14 }} animate={{ opacity: 1, y: 0 }}>
      <div className="eyebrow">PRIVATE COMMUNITY</div>
      <h1 className="page-title">Rooms</h1>

      <div className="rooms-layout">
        <aside className="glass rooms-list">
          {rooms.map((r) => (
            <button key={r.id} onClick={() => setSlug(r.slug)} className={`room-btn ${slug === r.slug ? 'active' : ''}`}>
              <span>{r.icon}</span> {r.name}
            </button>
          ))}
        </aside>

        <div className="glass chat-panel">
          <div className="chat-scroll" ref={(el) => el && el.scrollTo(0, el.scrollHeight)}>
            {messages.map((m) => (
              <motion.div key={m.id} className="msg" initial={{ opacity: 0, y: 10 }} animate={{ opacity: 1, y: 0 }} transition={{ duration: 0.25 }}>
                <span className={`mini-orb ${m.user_id === user?.id ? 'on' : ''}`}>
                  {(m.display_name || m.username).charAt(0).toUpperCase()}
                </span>
                <div>
                  <div className="msg-head">
                    <b>{m.display_name || m.username}</b>
                    {m.role === 'founder' && <span className="badge">👑</span>}
                    <span className="dim small">
                      {new Date(m.created_at).toLocaleTimeString(undefined, { hour: '2-digit', minute: '2-digit' })}
                    </span>
                  </div>
                  <div className="msg-body">{m.content}</div>
                </div>
              </motion.div>
            ))}
            {messages.length === 0 && <p className="dim center" style={{ padding: 40 }}>No messages yet. Say hi 🌌</p>}
          </div>
          <form onSubmit={send} className="chat-composer">
            <input value={draft} onChange={(e) => setDraft(e.target.value)} placeholder={`Message #${slug}…`} />
            <button className="btn btn-primary" disabled={!draft.trim()}>Send</button>
          </form>
        </div>
      </div>
    </motion.div>
  );
}

// ─── Profile ────────────────────────────────────────────
function Profile() {
  const { username } = useParams();
  const { user: me, setUser } = useAuth();
  const [profile, setProfile] = useState(null);
  const [editing, setEditing] = useState(false);
  const [form, setForm] = useState({ displayName: '', bio: '', customStatus: '' });
  const [loading, setLoading] = useState(true);

  const isMe = !username || username === me?.username;

  useEffect(() => {
    setLoading(true);
    api.get('/users').then(({ data }) => {
      const u = data.users.find((x) => x.username === (username || me.username));
      setProfile(u);
      if (u) setForm({ displayName: u.display_name || '', bio: u.bio || '', customStatus: u.custom_status || '' });
    }).finally(() => setLoading(false));
  }, [username, me?.username]);

  const save = async (e) => {
    e.preventDefault();
    await api.patch('/users/me', form);
    setProfile({ ...profile, display_name: form.displayName, bio: form.bio, custom_status: form.customStatus });
    setUser({ ...me, display_name: form.displayName });
    setEditing(false);
  };

  if (loading) return <Loader label="Finding this star…" />;
  if (!profile) return <p className="dim">This citizen does not exist.</p>;

  return (
    <motion.div initial={{ opacity: 0, scale: 1.06 }} animate={{ opacity: 1, scale: 1 }} transition={{ duration: 0.6 }}>
      <div className="glass profile-hero">
        <span className={`big-orb ${profile.status === 'online' ? 'on' : ''}`}>
          {(profile.display_name || profile.username).charAt(0).toUpperCase()}
        </span>
        <div className="grow">
          <h1 className="page-title" style={{ marginBottom: 4 }}>{profile.display_name || profile.username}</h1>
          <div className="dim">@{profile.username} · {profile.status} {profile.role === 'founder' && '· 👑 Founder'}</div>
          {profile.custom_status && <p className="muted" style={{ marginTop: 10, fontStyle: 'italic' }}>"{profile.custom_status}"</p>}
          {profile.bio && <p className="dim small" style={{ marginTop: 8 }}>{profile.bio}</p>}
        </div>
        {isMe && <button className="btn btn-ghost" onClick={() => setEditing((v) => !v)}>{editing ? 'Cancel' : 'Edit'}</button>}
      </div>

      <AnimatePresence>
        {editing && (
          <motion.form
            onSubmit={save}
            className="glass card"
            style={{ marginTop: 20 }}
            initial={{ opacity: 0, y: -10 }} animate={{ opacity: 1, y: 0 }} exit={{ opacity: 0, y: -10 }}
          >
            <label className="field"><span>Display name</span>
              <input value={form.displayName} onChange={(e) => setForm({ ...form, displayName: e.target.value })} />
            </label>
            <label className="field"><span>Status</span>
              <input value={form.customStatus} onChange={(e) => setForm({ ...form, customStatus: e.target.value })} placeholder="lost somewhere between midnight and music." />
            </label>
            <label className="field"><span>Bio</span>
              <textarea value={form.bio} onChange={(e) => setForm({ ...form, bio: e.target.value })} rows={3} />
            </label>
            <button className="btn btn-primary" style={{ alignSelf: 'flex-start' }}>Save changes</button>
          </motion.form>
        )}
      </AnimatePresence>
    </motion.div>
  );
}

// ─── Router & Guards ────────────────────────────────────
function Protected({ children }) {
  const { user, loading } = useAuth();
  if (loading) return <Loader />;
  if (!user) return <Navigate to="/login" replace />;
  return <Layout>{children}</Layout>;
}

function PublicOnly({ children }) {
  const { user, loading } = useAuth();
  if (loading) return <Loader />;
  if (user) return <Navigate to="/" replace />;
  return children;
}

export default function App() {
  return (
    <AuthProvider>
      <Cosmos />
      <Routes>
        <Route path="/welcome" element={<PublicOnly><Landing /></PublicOnly>} />
        <Route path="/login" element={<PublicOnly><Login /></PublicOnly>} />
        <Route path="/invite" element={<PublicOnly><Invite /></PublicOnly>} />
        <Route path="/" element={<Protected><Dashboard /></Protected>} />
        <Route path="/universe" element={<Protected><Universe /></Protected>} />
        <Route path="/rooms" element={<Protected><Rooms /></Protected>} />
        <Route path="/profile" element={<Protected><Profile /></Protected>} />
        <Route path="/profile/:username" element={<Protected><Profile /></Protected>} />
        <Route path="*" element={<Navigate to="/welcome" replace />} />
      </Routes>
    </AuthProvider>
  );
}
