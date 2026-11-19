import http from 'node:http';
import crypto from 'node:crypto';

class HttpError extends Error {
  constructor(status, message) {
    super(message);
    this.status = status;
  }
}
const bad = (m) => new HttpError(400, m);

// ---------- auth primitives ----------
const hashPassword = (pw) => {
  const salt = crypto.randomBytes(16).toString('hex');
  return `${salt}:${crypto.scryptSync(pw, salt, 64).toString('hex')}`;
};
const checkPassword = (pw, stored) => {
  const [salt, hash] = stored.split(':');
  const a = Buffer.from(hash, 'hex');
  const b = crypto.scryptSync(pw, salt, 64);
  return a.length === b.length && crypto.timingSafeEqual(a, b);
};
const sign = (secret, payload) => {
  const body = Buffer.from(JSON.stringify(payload)).toString('base64url');
  const mac = crypto.createHmac('sha256', secret).update(body).digest('base64url');
  return `${body}.${mac}`;
};
const verify = (secret, token) => {
  const [body, mac] = String(token).split('.');
  if (!body || !mac) return null;
  const expected = crypto.createHmac('sha256', secret).update(body).digest();
  const given = Buffer.from(mac, 'base64url');
  if (given.length !== expected.length || !crypto.timingSafeEqual(given, expected)) return null;
  const payload = JSON.parse(Buffer.from(body, 'base64url').toString());
  return payload.exp > Date.now() ? payload : null;
};

// ---------- validation ----------
const text = (v, field, max = 100) => {
  if (typeof v !== 'string' || !v.trim()) throw bad(`${field} wajib diisi`);
  if (v.trim().length > max) throw bad(`${field} terlalu panjang`);
  return v.trim();
};
const money = (v, field) => {
  if (!Number.isInteger(v) || v < 0 || v > 1e9) throw bad(`${field} tidak valid`);
  return v;
};
const email = (v) => {
  const e = text(v, 'Email', 120).toLowerCase();
  if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(e)) throw bad('Format email tidak valid');
  return e;
};
const password = (v) => {
  if (typeof v !== 'string' || v.length < 8) throw bad('Password minimal 8 karakter');
  return v;
};
const rupiah = (n) => 'Rp ' + n.toLocaleString('id-ID');

// Dates are Asia/Jakarta calendar days (UTC+7, no DST). Range end is exclusive.
const jakartaToday = () => new Date(Date.now() + 7 * 3600e3).toISOString().slice(0, 10);
function dayRange(from, to) {
  from = from || jakartaToday();
  to = to || from;
  const ok = (d) => /^\d{4}-\d{2}-\d{2}$/.test(d) && !isNaN(new Date(`${d}T00:00:00+07:00`));
  if (!ok(from) || !ok(to) || to < from) throw bad('Rentang tanggal tidak valid');
  const start = new Date(`${from}T00:00:00+07:00`).toISOString();
  const end = new Date(new Date(`${to}T00:00:00+07:00`).getTime() + 86400e3).toISOString();
  return [start, end];
}

// QRIS image must be a PNG or JPEG data URL under ~500KB. This checks the file type only;
// it does not decode the QR code to confirm it is a real QRIS.
function qrisImage(v) {
  if (v === null) return null;
  const m = /^data:image\/(png|jpeg);base64,([A-Za-z0-9+/=]+)$/.exec(typeof v === 'string' ? v : '');
  if (!m || v.length > 700_000) throw bad('QRIS harus berupa gambar PNG/JPG maksimal 500KB');
  const head = Buffer.from(m[2].slice(0, 16), 'base64');
  const isPng = head[0] === 0x89 && head[1] === 0x50 && head[2] === 0x4e && head[3] === 0x47;
  const isJpg = head[0] === 0xff && head[1] === 0xd8;
  if (!(m[1] === 'png' ? isPng : isJpg)) throw bad('File QRIS bukan gambar yang valid');
  return v;
}

export function createApp(db, { secret }) {
  const all = (s, ...p) => db.prepare(s).all(...p);
  const get = (s, ...p) => db.prepare(s).get(...p);
  const run = (s, ...p) => db.prepare(s).run(...p);
  const inTx = (fn) => {
    db.exec('BEGIN');
    try {
      const r = fn();
      db.exec('COMMIT');
      return r;
    } catch (e) {
      db.exec('ROLLBACK');
      throw e;
    }
  };

  const userView = (u) => ({ id: u.id, name: u.name, email: u.email, role: u.role, active: !!u.active });
  const session = (u) => ({
    token: sign(secret, { uid: u.id, exp: Date.now() + 12 * 3600e3 }),
    user: userView(u),
  });
  const business = (id) => {
    const b = get('SELECT id, name, type, qris_image AS qrisImage FROM merchants WHERE id = ?', id);
    return { ...b };
  };
  const menuView = (m) => ({ id: m.id, name: m.name, price: m.price, category: m.category, active: !!m.active });
  const txView = (id, merchantId) => {
    const t = get(
      `SELECT t.id, t.total, t.method, t.cash_received AS cashReceived, t.change_amount AS changeAmount,
              t.note, t.created_at AS createdAt, u.name AS cashier
       FROM transactions t JOIN users u ON u.id = t.cashier_id
       WHERE t.id = ? AND t.merchant_id = ?`,
      id,
      merchantId,
    );
    if (!t) return null;
    return { ...t, items: all('SELECT name, price, qty, note FROM transaction_items WHERE transaction_id = ? ORDER BY id', id).map((i) => ({ ...i })) };
  };
  const own = (table, id, merchantId) => {
    const row = get(`SELECT * FROM ${table} WHERE id = ? AND merchant_id = ?`, id, merchantId);
    if (!row) throw new HttpError(404, 'Data tidak ditemukan');
    return row;
  };

  // Each handler returns [status, data]. auth: 'public' | 'any' (owner or cashier) | 'owner'.
  const routes = [
    // ----- auth -----
    ['POST', '/api/auth/register', 'public', ({ body }) => {
      const businessName = text(body.businessName, 'Nama usaha');
      const type = body.businessType ?? 'warung';
      if (!['warung', 'fnb'].includes(type)) throw bad('Jenis usaha tidak valid');
      const name = text(body.name, 'Nama');
      const mail = email(body.email);
      const hash = hashPassword(password(body.password));
      if (get('SELECT 1 FROM users WHERE email = ?', mail)) throw new HttpError(409, 'Email sudah terdaftar');
      const userId = inTx(() => {
        const m = run('INSERT INTO merchants (name, type) VALUES (?, ?)', businessName, type);
        return run(
          "INSERT INTO users (merchant_id, name, email, password_hash, role) VALUES (?, ?, ?, ?, 'owner')",
          m.lastInsertRowid, name, mail, hash,
        ).lastInsertRowid;
      });
      return [201, session(get('SELECT * FROM users WHERE id = ?', userId))];
    }],
    ['POST', '/api/auth/login', 'public', ({ body }) => {
      const u = get('SELECT * FROM users WHERE email = ?', String(body.email ?? '').toLowerCase());
      if (!u || !u.active || typeof body.password !== 'string' || !checkPassword(body.password, u.password_hash)) {
        throw new HttpError(401, 'Email atau password salah');
      }
      return [200, session(u)];
    }],
    ['GET', '/api/me', 'any', ({ user }) => [200, { user: userView(user), business: business(user.merchant_id) }]],

    // ----- business / QRIS -----
    ['PUT', '/api/business/qris', 'owner', ({ user, body }) => {
      run('UPDATE merchants SET qris_image = ? WHERE id = ?', qrisImage(body.image ?? null), user.merchant_id);
      return [200, business(user.merchant_id)];
    }],

    // ----- menu -----
    ['GET', '/api/menu', 'any', ({ user }) => {
      const rows = user.role === 'owner'
        ? all('SELECT * FROM menu_items WHERE merchant_id = ? ORDER BY category, name', user.merchant_id)
        : all('SELECT * FROM menu_items WHERE merchant_id = ? AND active = 1 ORDER BY category, name', user.merchant_id);
      return [200, rows.map(menuView)];
    }],
    ['POST', '/api/menu', 'owner', ({ user, body }) => {
      const r = run(
        'INSERT INTO menu_items (merchant_id, name, price, category) VALUES (?, ?, ?, ?)',
        user.merchant_id, text(body.name, 'Nama menu'), money(body.price, 'Harga'),
        body.category ? text(body.category, 'Kategori', 50) : 'Lainnya',
      );
      return [201, menuView(own('menu_items', r.lastInsertRowid, user.merchant_id))];
    }],
    ['PATCH', '/api/menu/:id', 'owner', ({ user, params, body }) => {
      const cur = own('menu_items', params.id, user.merchant_id);
      run(
        'UPDATE menu_items SET name = ?, price = ?, category = ?, active = ? WHERE id = ?',
        body.name !== undefined ? text(body.name, 'Nama menu') : cur.name,
        body.price !== undefined ? money(body.price, 'Harga') : cur.price,
        body.category !== undefined ? text(body.category, 'Kategori', 50) : cur.category,
        body.active !== undefined ? (body.active ? 1 : 0) : cur.active,
        cur.id,
      );
      return [200, menuView(own('menu_items', cur.id, user.merchant_id))];
    }],

    // ----- staff -----
    ['GET', '/api/staff', 'owner', ({ user }) =>
      [200, all('SELECT * FROM users WHERE merchant_id = ? ORDER BY id', user.merchant_id).map(userView)]],
    ['POST', '/api/staff', 'owner', ({ user, body }) => {
      const role = body.role ?? 'cashier';
      if (!['owner', 'cashier'].includes(role)) throw bad('Role tidak valid');
      const mail = email(body.email);
      const name = text(body.name, 'Nama');
      const hash = hashPassword(password(body.password));
      if (get('SELECT 1 FROM users WHERE email = ?', mail)) throw new HttpError(409, 'Email sudah terdaftar');
      const r = run(
        'INSERT INTO users (merchant_id, name, email, password_hash, role) VALUES (?, ?, ?, ?, ?)',
        user.merchant_id, name, mail, hash, role,
      );
      return [201, userView(own('users', r.lastInsertRowid, user.merchant_id))];
    }],
    ['PATCH', '/api/staff/:id', 'owner', ({ user, params, body }) => {
      const cur = own('users', params.id, user.merchant_id);
      if (cur.id === user.id && body.active === false) throw bad('Anda tidak bisa menonaktifkan akun sendiri');
      run(
        'UPDATE users SET name = ?, active = ?, password_hash = ? WHERE id = ?',
        body.name !== undefined ? text(body.name, 'Nama') : cur.name,
        body.active !== undefined ? (body.active ? 1 : 0) : cur.active,
        body.password !== undefined ? hashPassword(password(body.password)) : cur.password_hash,
        cur.id,
      );
      return [200, userView(own('users', cur.id, user.merchant_id))];
    }],

    // ----- transactions -----
    // Called once the cashier has confirmed payment. Prices come from the DB, never from the client.
    // clientId makes the call idempotent, so a double tap or retry can't create a duplicate sale.
    ['POST', '/api/transactions', 'any', ({ user, body }) => {
      const m = user.merchant_id;
      const clientId = text(body.clientId, 'clientId', 64);
      const dup = get('SELECT id FROM transactions WHERE merchant_id = ? AND client_id = ?', m, clientId);
      if (dup) return [200, txView(dup.id, m)];

      if (!['cash', 'qris'].includes(body.method)) throw bad('Metode pembayaran tidak valid');
      if (!Array.isArray(body.items) || body.items.length === 0 || body.items.length > 100) {
        throw bad('Pesanan kosong');
      }
      const lines = body.items.map((i) => {
        const item = get('SELECT id, name, price FROM menu_items WHERE id = ? AND merchant_id = ? AND active = 1', i?.menuItemId, m);
        if (!item) throw bad('Ada menu yang tidak tersedia');
        if (!Number.isInteger(i.qty) || i.qty < 1 || i.qty > 999) throw bad('Jumlah tidak valid');
        return { item, qty: i.qty, note: i.note ? text(i.note, 'Catatan', 200) : null };
      });
      const total = lines.reduce((s, l) => s + l.item.price * l.qty, 0);

      let cashReceived = null;
      let change = null;
      if (body.method === 'cash') {
        cashReceived = money(body.cashReceived, 'Uang diterima');
        if (cashReceived < total) throw bad(`Uang kurang ${rupiah(total - cashReceived)}`);
        change = cashReceived - total;
      }
      const id = inTx(() => {
        const t = run(
          'INSERT INTO transactions (merchant_id, cashier_id, total, method, cash_received, change_amount, note, client_id) VALUES (?, ?, ?, ?, ?, ?, ?, ?)',
          m, user.id, total, body.method, cashReceived, change, body.note ? text(body.note, 'Catatan', 200) : null, clientId,
        ).lastInsertRowid;
        for (const l of lines) {
          run(
            'INSERT INTO transaction_items (transaction_id, menu_item_id, name, price, qty, note) VALUES (?, ?, ?, ?, ?, ?)',
            t, l.item.id, l.item.name, l.item.price, l.qty, l.note,
          );
        }
        return t;
      });
      return [201, txView(id, m)];
    }],
    ['GET', '/api/transactions', 'owner', ({ user, query }) => {
      const [start, end] = dayRange(query.from, query.to);
      const q = (query.q ?? '').trim();
      const like = `%${q.replace(/[%_]/g, '')}%`;
      const rows = all(
        `SELECT t.id, t.total, t.method, t.created_at AS createdAt, u.name AS cashier,
                (SELECT group_concat(name || ' x' || qty, ', ') FROM transaction_items WHERE transaction_id = t.id) AS summary
         FROM transactions t JOIN users u ON u.id = t.cashier_id
         WHERE t.merchant_id = ? AND t.created_at >= ? AND t.created_at < ?
           AND (? = '' OR t.id = CAST(? AS INTEGER) OR u.name LIKE ?
                OR EXISTS (SELECT 1 FROM transaction_items i WHERE i.transaction_id = t.id AND i.name LIKE ?))
         ORDER BY t.created_at DESC LIMIT 200`,
        user.merchant_id, start, end, q, q, like, like,
      );
      return [200, rows.map((r) => ({ ...r }))];
    }],

    // ----- dashboard (P0 widgets) -----
    ['GET', '/api/dashboard', 'owner', ({ user, query }) => {
      const [start, end] = dayRange(query.from, query.to);
      const m = user.merchant_id;
      const totals = get(
        `SELECT COALESCE(SUM(total), 0) AS totalSales, COUNT(*) AS count,
                COALESCE(SUM(CASE WHEN method = 'cash' THEN total END), 0) AS cash,
                COALESCE(SUM(CASE WHEN method = 'qris' THEN total END), 0) AS qris
         FROM transactions WHERE merchant_id = ? AND created_at >= ? AND created_at < ?`,
        m, start, end,
      );
      const top = all(
        `SELECT i.name, SUM(i.qty) AS qty, SUM(i.qty * i.price) AS revenue
         FROM transaction_items i JOIN transactions t ON t.id = i.transaction_id
         WHERE t.merchant_id = ? AND t.created_at >= ? AND t.created_at < ?
         GROUP BY i.menu_item_id, i.name ORDER BY qty DESC, revenue DESC LIMIT 5`,
        m, start, end,
      );
      return [200, { ...totals, topItems: top.map((r) => ({ ...r })) }];
    }],
  ].map(([method, path, auth, fn]) => ({
    method,
    auth,
    fn,
    re: new RegExp('^' + path.replace(/:(\w+)/g, '(?<$1>\\d+)') + '$'),
  }));

  async function readBody(req) {
    let size = 0;
    const chunks = [];
    for await (const c of req) {
      size += c.length;
      if (size > 1_000_000) throw new HttpError(413, 'Permintaan terlalu besar');
      chunks.push(c);
    }
    if (!chunks.length) return {};
    try {
      const b = JSON.parse(Buffer.concat(chunks).toString());
      if (b === null || typeof b !== 'object' || Array.isArray(b)) throw 0;
      return b;
    } catch {
      throw bad('JSON tidak valid');
    }
  }

  return http.createServer(async (req, res) => {
    const send = (status, data) => {
      res.writeHead(status, { 'Content-Type': 'application/json' });
      res.end(JSON.stringify(data));
    };
    try {
      const url = new URL(req.url, 'http://x');
      let route;
      let params;
      for (const r of routes) {
        const m = r.method === req.method && r.re.exec(url.pathname);
        if (m) {
          route = r;
          params = { ...m.groups };
          break;
        }
      }
      if (!route) throw new HttpError(404, 'Tidak ditemukan');

      let user = null;
      if (route.auth !== 'public') {
        const token = (req.headers.authorization ?? '').replace(/^Bearer /, '');
        const payload = verify(secret, token);
        // Re-check the DB every request so a deactivated account loses access immediately.
        user = payload && get('SELECT * FROM users WHERE id = ? AND active = 1', payload.uid);
        if (!user) throw new HttpError(401, 'Sesi berakhir, silakan masuk lagi');
        if (route.auth === 'owner' && user.role !== 'owner') throw new HttpError(403, 'Akses ditolak');
      }
      const body = ['POST', 'PUT', 'PATCH'].includes(req.method) ? await readBody(req) : {};
      const [status, data] = route.fn({ user, params, query: Object.fromEntries(url.searchParams), body });
      send(status, data);
    } catch (e) {
      if (e instanceof HttpError) return send(e.status, { error: e.message });
      console.error(e);
      send(500, { error: 'Terjadi kesalahan di server' });
    }
  });
}
