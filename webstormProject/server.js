import 'dotenv/config';
import express from 'express';
import cookieParser from 'cookie-parser';
import bcrypt from 'bcryptjs';
import jwt from 'jsonwebtoken';
import pg from 'pg';
import path from 'node:path';
import { query } from './db.js';

pg.types.setTypeParser(1082, (v) => v);
pg.types.setTypeParser(1114, (v) => new Date(v.replace(' ', 'T') + 'Z'));

const SECRET = process.env.JWT_SECRET;
if (!SECRET || SECRET.length < 32) {
    throw new Error('JWT_SECRET is missing or too short (min 32 characters). Add it to .env (see .env.example).');
}

const T = {
    roles:             { pk: 'role_id',     cols: ['role_name', 'description'] },
    users:             { pk: 'user_id',     cols: ['username', 'email', 'password_hash', 'role_id', 'comment_banned_until', 'comment_ban_reason'],
        sel: 'user_id, username, email, role_id, comment_banned_until, comment_ban_reason, created_at' }, // never return password_hash
    habitats:          { pk: 'habitat_id',  cols: ['name', 'climate_type', 'capacity', 'maintenance_status'] },
    animals:           { pk: 'animal_id',   cols: ['name', 'species', 'gender', 'birth_date', 'habitat_id', 'health_status',
            'is_public', 'public_description', 'fun_fact', 'image_url', 'conservation_status'],
        sel: '*, (SELECT COUNT(*) FROM animal_comments c WHERE c.animal_id = animals.animal_id)::int AS comment_count' },
    medical_records:   { pk: 'record_id',   cols: ['animal_id', 'veterinarian_id', 'diagnosis', 'treatment', 'record_date', 'follow_up_date'] },
    feeding_schedules: { pk: 'schedule_id', cols: ['animal_id', 'keeper_id', 'food_type', 'quantity_kg', 'feeding_time'] },
    ticket_sales:      { pk: 'ticket_id',   cols: ['user_id', 'ticket_type', 'price', 'status'] },
};
for (const t of Object.values(T)) t.sel ??= '*';

const TICKET_CATALOG = [
    { id: 'adult',  ticket_type: 'Adult Admission',      price: 24.00, badge: 'Most Popular', desc: 'Full-day general admission for visitors ages 13–64.' },
    { id: 'child',  ticket_type: 'Child Admission',      price: 14.00, badge: 'Ages 3–12',    desc: 'Full-day general admission for children. Under 3 enters free.' },
    { id: 'senior', ticket_type: 'Senior Admission',     price: 18.00, badge: 'Ages 65+',     desc: 'Discounted full-day admission for senior visitors.' },
    { id: 'family', ticket_type: 'Family Pack (4x)',     price: 65.00, badge: 'Best Value',   desc: 'Includes entry for 2 adults and 2 children in a single pass.' },
    { id: 'vip',    ticket_type: 'VIP Keeper Experience',price: 55.00, badge: 'Guided Tour',  desc: 'General admission plus a guided behind-the-scenes feeding tour.' },
];

const STAFF = { animals: 'rw', habitats: 'rw', medical_records: 'rw', feeding_schedules: 'rw' };
const PERMS = {
    admin:        {
        animals: 'r',
        habitats: 'r',
        medical_records: 'r',
        feeding_schedules: 'r',
        ticket_sales: 'rw',
        users: 'rw',
        roles: 'rw',
    },
    zookeeper:    STAFF,
    keeper:       STAFF,
    veterinarian: STAFF,
    user:         { animals: 'r', habitats: 'r', feeding_schedules: 'r' },
};
const HIDE = { user: { feeding_schedules: ['keeper_id'] } };
const PUBLIC_ANIMALS = 'is_public = TRUE';
const FILTER = {
    user: {
        animals: PUBLIC_ANIMALS,
        feeding_schedules: `animal_id IN (SELECT animal_id FROM animals WHERE ${PUBLIC_ANIMALS})`,
    },
};
const LOOKUP = { roles: 'role_name', users: 'username', habitats: 'name', animals: 'name' };

const roleKey = (r) => String(r ?? '').toLowerCase().replace(/[^a-z]/g, '');
const eff = (role) => (Object.hasOwn(PERMS, roleKey(role)) ? roleKey(role) : 'user');
const isAdminRole = (role) => eff(role) === 'admin';
const can = (role, table, mode) => !!PERMS[eff(role)][table]?.includes(mode);
const strip = (rows, role, table) => {
    const hidden = HIDE[eff(role)]?.[table] || [];
    return hidden.length ? rows.map((r) => Object.fromEntries(Object.entries(r).filter(([k]) => !hidden.includes(k)))) : rows;
};

function formatDuration(ms) {
    const totalSec = Math.max(1, Math.ceil(ms / 1000));
    if (totalSec < 60) return `${totalSec} second${totalSec === 1 ? '' : 's'}`;
    const totalMin = Math.ceil(totalSec / 60);
    if (totalMin < 60) return `${totalMin} minute${totalMin === 1 ? '' : 's'}`;
    const totalHr = Math.floor(totalMin / 60);
    const remMin = totalMin % 60;
    if (totalHr < 24) {
        return remMin ? `${totalHr}h ${remMin}m` : `${totalHr} hour${totalHr === 1 ? '' : 's'}`;
    }
    const days = Math.floor(totalHr / 24);
    const remHr = totalHr % 24;
    return remHr ? `${days}d ${remHr}h` : `${days} day${days === 1 ? '' : 's'}`;
}

function getActiveBan(userRow) {
    if (!userRow?.comment_banned_until) return null;
    const until = new Date(userRow.comment_banned_until);
    if (Number.isNaN(until.getTime())) return null;
    const remainingMs = until.getTime() - Date.now();
    if (remainingMs <= 0) return null;
    return {
        until: until.toISOString(),
        remainingMs,
        remainingText: formatDuration(remainingMs),
        reason: userRow.comment_ban_reason || null,
    };
}

const app = express();
app.use(express.json());
app.use(cookieParser());
app.use(express.static(path.join(import.meta.dirname, 'public')));

const DUMMY_HASH = bcrypt.hashSync('not-a-real-password', 10);

const setSession = (res, id) =>
    res.cookie('token', jwt.sign({ id }, SECRET, { expiresIn: '8h' }), {
        httpOnly: true, sameSite: 'strict', secure: process.env.NODE_ENV === 'production', maxAge: 8 * 3600 * 1000,
    });

const rate = (max, windowMs, keyOf) => {
    const hits = new Map();
    return (req, res, next) => {
        const now = Date.now(), key = keyOf(req);
        let h = hits.get(key);
        if (!h || h.reset < now) h = { n: 0, reset: now + windowMs };
        h.n++; hits.set(key, h);
        if (h.n > max) return res.status(429).json({ error: 'Too many attempts. Please wait a moment and try again.' });
        next();
    };
};
const limiter = rate(30, 15 * 60 * 1000, (req) => req.ip);
const commentLimiter = rate(8, 60 * 1000, (req) => req.user.user_id);
const ticketLimiter = rate(20, 10 * 60 * 1000, (req) => req.user.user_id);

const checkPassword = (p) => {
    if (typeof p !== 'string' || p.length < 8 || p.length > 72) throw new Error('Password must be 8 to 72 characters');
};

const auth = async (req, res, next) => {
    req.user = null;
    const token = req.cookies.token;
    if (token) {
        let id = null;
        try { id = jwt.verify(token, SECRET).id; } catch { res.clearCookie('token'); }
        if (id !== null) {
            try {
                const { rows } = await query(
                    `SELECT u.user_id, u.username, u.email, u.role_id, u.comment_banned_until, u.comment_ban_reason, r.role_name AS role
           FROM users u JOIN roles r ON r.role_id = u.role_id WHERE u.user_id = $1`, [id]);
                req.user = rows[0] ?? null;
            } catch { return res.status(500).json({ error: 'Server error, please try again' }); }
        }
    }
    next();
};

app.post('/api/signup', limiter, async (req, res) => {
    try {
        const { username, email, password } = req.body ?? {};
        if (!/^[\w.-]{3,50}$/.test(username ?? '')) throw new Error('Username: 3 to 50 letters, numbers, dots, dashes or underscores');
        if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email ?? '') || email.length > 100) throw new Error('Enter a valid email address');
        checkPassword(password);
        const { rows: [role] } = await query(`SELECT role_id FROM roles WHERE role_name = 'User'`);
        if (!role) throw new Error("Sign-up is not set up yet. Run 'npm run setup:auth' first.");
        const hash = await bcrypt.hash(password, 10);
        const { rows: [u] } = await query(
            'INSERT INTO users (username, email, password_hash, role_id) VALUES ($1, $2, $3, $4) RETURNING user_id',
            [username, email, hash, role.role_id]);
        setSession(res, u.user_id);
        res.json({ ok: true });
    } catch (err) {
        const dup = err.code === '23505';
        res.status(dup ? 409 : 400).json({ error: dup ? 'That username or email is already taken' : err.message });
    }
});

app.post('/api/login', limiter, async (req, res) => {
    try {
        const { username, password } = req.body ?? {};
        const { rows: [u] } = await query(
            'SELECT user_id, password_hash FROM users WHERE username = $1', [String(username ?? '')]);
        const ok = await bcrypt.compare(String(password ?? ''), u?.password_hash ?? DUMMY_HASH);
        if (!u || !ok) return res.status(401).json({ error: 'Invalid username or password' });
        setSession(res, u.user_id);
        res.json({ ok: true });
    } catch {
        res.status(500).json({ error: 'Login failed, please try again' });
    }
});

app.post('/api/logout', (req, res) => { res.clearCookie('token'); res.json({ ok: true }); });

app.get('/api/me', auth, (req, res) => {
    const role = req.user?.role, tables = {};
    for (const [n, p] of Object.entries(PERMS[eff(role)])) {
        if (p.includes('r')) tables[n] = { write: p.includes('w'), hide: HIDE[eff(role)]?.[n] || [] };
    }
    const commentTimeout = req.user ? getActiveBan(req.user) : null;
    res.json({
        user: req.user && {
            user_id: req.user.user_id,
            username: req.user.username,
            email: req.user.email,
            role: req.user.role,
            is_admin: isAdminRole(req.user.role),
            can_buy_tickets: eff(req.user.role) === 'user',
            comment_timeout: commentTimeout,
        },
        tables,
        ticket_catalog: TICKET_CATALOG,
    });
});

app.get('/api/lookup/:table', auth, async (req, res) => {
    const n = req.params.table, role = req.user?.role;
    if (!Object.hasOwn(LOOKUP, n)) return res.status(404).json({ error: 'Unknown table' });
    const isStaff = Object.values(PERMS[eff(role)]).some((p) => p.includes('w'));
    if (!isStaff && !can(role, n, 'r')) return res.status(403).json({ error: 'Your role is not allowed to do that' });
    const f = FILTER[eff(role)]?.[n];
    try {
        const { rows } = await query(
            `SELECT ${T[n].pk} AS id, ${LOOKUP[n]} AS label FROM ${n} ${f ? 'WHERE ' + f : ''} ORDER BY label`);
        res.json(rows);
    } catch (err) { res.status(400).json({ error: err.message }); }
});

const needLogin = (req, res, next) =>
    req.user ? next() : res.status(401).json({ error: 'Please log in to join the discussion' });
const needAdmin = (req, res, next) => {
    if (!req.user) return res.status(401).json({ error: 'Please log in first' });
    if (!isAdminRole(req.user.role)) return res.status(403).json({ error: 'Admin access required' });
    next();
};
const needRegularUser = (req, res, next) => {
    if (!req.user) return res.status(401).json({ error: 'Please log in to purchase tickets' });
    if (eff(req.user.role) !== 'user') {
        return res.status(403).json({ error: 'Only regular visitor accounts can purchase tickets' });
    }
    next();
};

app.get('/api/tickets/catalog', (req, res) => {
    res.json(TICKET_CATALOG);
});

app.get('/api/my-tickets', auth, needRegularUser, async (req, res) => {
    try {
        const { rows } = await query(
            `SELECT ticket_id, user_id, ticket_type, price, status, purchase_date
             FROM ticket_sales
             WHERE user_id = $1
             ORDER BY purchase_date DESC, ticket_id DESC
                 LIMIT 100`,
            [req.user.user_id]
        );
        res.json(rows);
    } catch (err) {
        res.status(400).json({ error: err.message });
    }
});

app.post('/api/tickets/purchase', auth, needRegularUser, ticketLimiter, async (req, res) => {
    try {
        const { tier_id, quantity } = req.body ?? {};
        const tier = TICKET_CATALOG.find((t) => t.id === String(tier_id ?? ''));
        if (!tier) throw new Error('Please choose a valid ticket type');
        const qty = Number(quantity ?? 1);
        if (!Number.isInteger(qty) || qty < 1 || qty > 10) {
            throw new Error('Quantity must be between 1 and 10 tickets per order');
        }

        const created = [];
        for (let i = 0; i < qty; i++) {
            const { rows: [row] } = await query(
                `INSERT INTO ticket_sales (user_id, ticket_type, price, status)
         VALUES ($1, $2, $3, 'Paid')
         RETURNING ticket_id, user_id, ticket_type, price, status, purchase_date`,
                [req.user.user_id, tier.ticket_type, tier.price]
            );
            created.push(row);
        }

        res.json({
            ok: true,
            tickets: created,
            quantity: qty,
            ticket_type: tier.ticket_type,
            unit_price: tier.price,
            total_price: Number((tier.price * qty).toFixed(2)),
        });
    } catch (err) {
        res.status(400).json({ error: err.message });
    }
});

async function ensureSchema() {
    await query(`ALTER TABLE users
        ADD COLUMN IF NOT EXISTS comment_banned_until TIMESTAMPTZ,
        ADD COLUMN IF NOT EXISTS comment_ban_reason TEXT`);
    await query(`ALTER TABLE ticket_sales
        ALTER COLUMN purchase_date SET DEFAULT now()`);
    await query(`CREATE TABLE IF NOT EXISTS animal_comments (
    comment_id SERIAL PRIMARY KEY,
    animal_id INT NOT NULL,
    user_id INT,
    body TEXT NOT NULL CHECK (char_length(body) BETWEEN 1 AND 1000),
    created_at TIMESTAMPTZ DEFAULT now(),
    CONSTRAINT fk_comment_animal FOREIGN KEY (animal_id) REFERENCES animals(animal_id) ON DELETE CASCADE,
    CONSTRAINT fk_comment_user FOREIGN KEY (user_id) REFERENCES users(user_id) ON DELETE SET NULL)`);
    await query('CREATE INDEX IF NOT EXISTS idx_comments_animal ON animal_comments (animal_id, created_at DESC)');
}

const animalVisible = async (id, role) => {
    if (!/^\d+$/.test(id)) return false;
    const f = FILTER[eff(role)]?.animals;
    const { rows } = await query(`SELECT 1 FROM animals WHERE animal_id = $1 ${f ? 'AND ' + f : ''}`, [id]);
    return rows.length > 0;
};

app.get('/api/animals/:id/comments', auth, async (req, res) => {
    try {
        if (!(await animalVisible(req.params.id, req.user?.role))) return res.status(404).json({ error: 'Animal not found' });
        const { rows } = await query(
            `SELECT c.comment_id, c.user_id, c.body, c.created_at, u.username, u.comment_banned_until, u.comment_ban_reason, r.role_name AS role
             FROM animal_comments c
                      LEFT JOIN users u ON u.user_id = c.user_id
                      LEFT JOIN roles r ON r.role_id = u.role_id
             WHERE c.animal_id = $1 ORDER BY c.created_at DESC, c.comment_id DESC LIMIT 200`, [req.params.id]);
        const me = req.user, admin = !!me && isAdminRole(me.role);
        res.json(rows.map((c) => ({
            comment_id: c.comment_id,
            user_id: c.user_id,
            body: c.body,
            created_at: c.created_at,
            username: c.username,
            role: c.role,
            user_timeout: getActiveBan(c),
            can_delete: !!me && (admin || me.user_id === c.user_id),
            can_moderate: admin && !!c.user_id && c.user_id !== me.user_id,
        })));
    } catch (err) { res.status(400).json({ error: err.message }); }
});

app.post('/api/animals/:id/comments', auth, needLogin, commentLimiter, async (req, res) => {
    try {
        if (!(await animalVisible(req.params.id, req.user.role))) return res.status(404).json({ error: 'Animal not found' });
        const { rows: [freshUser] } = await query(
            'SELECT comment_banned_until, comment_ban_reason FROM users WHERE user_id = $1', [req.user.user_id]);
        const ban = getActiveBan(freshUser);
        if (ban) {
            return res.status(403).json({
                error: `You are on a comment timeout for ${ban.remainingText}${ban.reason ? `: ${ban.reason}` : '.'}`,
                comment_timeout: ban,
            });
        }
        const text = String(req.body?.body ?? '').trim();
        if (!text) throw new Error('Write something first');
        if (text.length > 1000) throw new Error('Comments can be at most 1000 characters');
        await query('INSERT INTO animal_comments (animal_id, user_id, body) VALUES ($1, $2, $3)',
            [req.params.id, req.user.user_id, text]);
        res.json({ ok: true });
    } catch (err) { res.status(400).json({ error: err.message }); }
});

app.delete('/api/comments/:id', auth, needLogin, async (req, res) => {
    try {
        if (!/^\d+$/.test(req.params.id)) return res.status(404).json({ error: 'Comment not found' });
        const { rows: [c] } = await query('SELECT user_id FROM animal_comments WHERE comment_id = $1', [req.params.id]);
        if (!c) return res.status(404).json({ error: 'Comment not found' });
        if (c.user_id !== req.user.user_id && !isAdminRole(req.user.role)) {
            return res.status(403).json({ error: 'You can only delete your own comments' });
        }
        await query('DELETE FROM animal_comments WHERE comment_id = $1', [req.params.id]);
        res.json({ deleted: true });
    } catch (err) { res.status(400).json({ error: err.message }); }
});

app.get('/api/comments', auth, needAdmin, async (req, res) => {
    try {
        const { rows } = await query(
            `SELECT c.comment_id, c.animal_id, c.user_id, c.body, c.created_at,
                    a.name AS animal_name, u.username, u.comment_banned_until, u.comment_ban_reason, r.role_name AS role
             FROM animal_comments c
                      JOIN animals a ON a.animal_id = c.animal_id
                      LEFT JOIN users u ON u.user_id = c.user_id
                      LEFT JOIN roles r ON r.role_id = u.role_id
             ORDER BY c.created_at DESC, c.comment_id DESC LIMIT 200`);
        res.json(rows.map((c) => ({
            comment_id: c.comment_id,
            animal_id: c.animal_id,
            animal_name: c.animal_name,
            user_id: c.user_id,
            username: c.username,
            role: c.role,
            body: c.body,
            created_at: c.created_at,
            user_timeout: getActiveBan(c),
            can_timeout: !!c.user_id && c.user_id !== req.user.user_id,
        })));
    } catch (err) { res.status(400).json({ error: err.message }); }
});

app.post('/api/users/:id/comment-timeout', auth, needAdmin, async (req, res) => {
    try {
        if (!/^\d+$/.test(req.params.id)) return res.status(404).json({ error: 'User not found' });
        const targetId = Number(req.params.id);
        if (targetId === req.user.user_id) {
            throw new Error("You can't put your own account on a comment timeout");
        }
        const { rows: [target] } = await query(
            `SELECT u.user_id, u.username, r.role_name AS role
       FROM users u JOIN roles r ON r.role_id = u.role_id WHERE u.user_id = $1`, [targetId]);
        if (!target) return res.status(404).json({ error: 'User not found' });
        if (isAdminRole(target.role)) {
            throw new Error('Admin accounts cannot be placed on a comment timeout');
        }

        const minutesRaw = Number(req.body?.duration_minutes ?? 0);
        if (!Number.isFinite(minutesRaw) || minutesRaw < 0 || minutesRaw > 60 * 24 * 365) {
            throw new Error('Duration must be between 0 (clear) and 525,600 minutes (1 year)');
        }
        const reason = String(req.body?.reason ?? '').trim().slice(0, 250) || null;

        if (minutesRaw === 0) {
            await query(
                'UPDATE users SET comment_banned_until = NULL, comment_ban_reason = NULL WHERE user_id = $1',
                [targetId]);
            return res.json({ ok: true, user_id: targetId, username: target.username, comment_timeout: null });
        }

        const untilDate = new Date(Date.now() + minutesRaw * 60 * 1000);
        await query(
            'UPDATE users SET comment_banned_until = $1, comment_ban_reason = $2 WHERE user_id = $3',
            [untilDate.toISOString(), reason, targetId]);

        const { rows: [updated] } = await query(
            'SELECT comment_banned_until, comment_ban_reason FROM users WHERE user_id = $1', [targetId]);
        res.json({
            ok: true,
            user_id: targetId,
            username: target.username,
            comment_timeout: getActiveBan(updated),
        });
    } catch (err) { res.status(400).json({ error: err.message }); }
});

const route = (mode, fn) => [auth, async (req, res) => {
    const name = req.params.table;
    if (!Object.hasOwn(T, name)) return res.status(404).json({ error: 'Unknown table' });
    if (mode === 'w' && !req.user) return res.status(401).json({ error: 'Please log in to make changes' });
    if (!can(req.user?.role, name, mode)) return res.status(403).json({ error: 'Your role is not allowed to do that' });
    try {
        res.json(await fn(name, T[name], req));
    } catch (err) {
        res.status(400).json({ error: err.detail || err.message });
    }
}];
const pick = (t, body) => t.cols.filter((c) => body[c] !== undefined);

const prepare = async (name, body, creating) => {
    const b = { ...body };
    delete b.password_hash;
    if (name === 'users') {
        if (b.password) { checkPassword(b.password); b.password_hash = await bcrypt.hash(b.password, 10); }
        else if (creating) throw new Error('Password is required');
        if (b.comment_banned_until === '' || b.comment_banned_until === null) b.comment_banned_until = null;
        if (b.comment_ban_reason === '') b.comment_ban_reason = null;
    }
    return b;
};

app.get('/api/:table', ...route('r', async (name, t, req) => {
    const f = FILTER[eff(req.user?.role)]?.[name];
    const { rows } = await query(`SELECT ${t.sel} FROM ${name} ${f ? 'WHERE ' + f : ''} ORDER BY ${t.pk}`);
    return strip(rows, req.user?.role, name);
}));

app.post('/api/:table', ...route('w', async (name, t, req) => {
    const body = await prepare(name, req.body ?? {}, true);
    const cs = pick(t, body);
    const sql = cs.length
        ? `INSERT INTO ${name} (${cs.join(',')}) VALUES (${cs.map((_, i) => '$' + (i + 1))}) RETURNING ${t.sel}`
        : `INSERT INTO ${name} DEFAULT VALUES RETURNING ${t.sel}`;
    return (await query(sql, cs.map((c) => body[c]))).rows[0];
}));

app.put('/api/:table/:id', ...route('w', async (name, t, req) => {
    const body = await prepare(name, req.body ?? {}, false);
    if (name === 'users' && req.params.id == req.user.user_id && body.role_id !== undefined && body.role_id != req.user.role_id) {
        throw new Error("You can't change your own role");
    }
    const cs = pick(t, body);
    if (!cs.length) throw new Error('Nothing to update');
    const sets = cs.map((c, i) => `${c}=$${i + 1}`).join(',');
    const { rows } = await query(
        `UPDATE ${name} SET ${sets} WHERE ${t.pk}=$${cs.length + 1} RETURNING ${t.sel}`,
        [...cs.map((c) => body[c]), req.params.id]);
    if (!rows.length) throw new Error('Record not found');
    return rows[0];
}));

app.delete('/api/:table/:id', ...route('w', async (name, t, req) => {
    if (name === 'users' && req.params.id == req.user.user_id) throw new Error("You can't delete your own account");
    await query(`DELETE FROM ${name} WHERE ${t.pk}=$1`, [req.params.id]);
    return { deleted: true };
}));

try { await ensureSchema(); } catch (err) { console.error('Could not prepare the database:', err.message); process.exit(1); }

const port = process.env.PORT || 3000;
app.listen(port, () => console.log(`Zoo app running at http://localhost:${port}`));
