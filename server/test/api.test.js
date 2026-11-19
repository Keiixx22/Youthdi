import { test, before, after } from 'node:test';
import assert from 'node:assert/strict';
import { openDb } from '../src/db.js';
import { createApp } from '../src/app.js';

let server, base;
before(async () => {
  server = createApp(openDb(), { secret: 'test-secret' });
  await new Promise((r) => server.listen(0, r));
  base = `http://localhost:${server.address().port}`;
});
after(() => server.close());

async function call(method, path, { token, body } = {}) {
  const res = await fetch(base + path, {
    method,
    headers: { 'Content-Type': 'application/json', ...(token && { Authorization: `Bearer ${token}` }) },
    body: body && JSON.stringify(body),
  });
  return { status: res.status, data: await res.json() };
}

async function newMerchant(tag) {
  const r = await call('POST', '/api/auth/register', {
    body: { businessName: `Warung ${tag}`, name: `Owner ${tag}`, email: `owner-${tag}@x.id`, password: 'rahasia123' },
  });
  assert.equal(r.status, 201);
  return r.data.token;
}

// 1x1 PNG
const PNG = 'data:image/png;base64,iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mNkYPhfDwAChwGA60e6kgAAAABJRU5ErkJggg==';

test('register, login, wrong password, duplicate email', async () => {
  await newMerchant('a');
  assert.equal((await call('POST', '/api/auth/login', { body: { email: 'owner-a@x.id', password: 'rahasia123' } })).status, 200);
  assert.equal((await call('POST', '/api/auth/login', { body: { email: 'owner-a@x.id', password: 'salah-salah' } })).status, 401);
  const dup = await call('POST', '/api/auth/register', { body: { businessName: 'X', name: 'Y', email: 'owner-a@x.id', password: 'rahasia123' } });
  assert.equal(dup.status, 409);
  assert.equal((await call('GET', '/api/me')).status, 401);
});

test('full sale flow: cash change, shortfall blocked, qris, idempotency, price snapshot', async () => {
  const owner = await newMerchant('b');
  const nasi = (await call('POST', '/api/menu', { token: owner, body: { name: 'Nasi Goreng', price: 15000, category: 'Makanan' } })).data;
  const teh = (await call('POST', '/api/menu', { token: owner, body: { name: 'Es Teh', price: 5000 } })).data;
  const order = [{ menuItemId: nasi.id, qty: 2 }, { menuItemId: teh.id, qty: 1 }]; // 35.000

  const short = await call('POST', '/api/transactions', { token: owner, body: { clientId: 'c1', method: 'cash', cashReceived: 30000, items: order } });
  assert.equal(short.status, 400);
  assert.match(short.data.error, /kurang/);

  const cash = await call('POST', '/api/transactions', { token: owner, body: { clientId: 'c2', method: 'cash', cashReceived: 50000, items: order } });
  assert.equal(cash.status, 201);
  assert.equal(cash.data.total, 35000);
  assert.equal(cash.data.changeAmount, 15000);

  const again = await call('POST', '/api/transactions', { token: owner, body: { clientId: 'c2', method: 'cash', cashReceived: 50000, items: order } });
  assert.equal(again.status, 200);
  assert.equal(again.data.id, cash.data.id);

  const qris = await call('POST', '/api/transactions', { token: owner, body: { clientId: 'c3', method: 'qris', items: [{ menuItemId: teh.id, qty: 2 }] } });
  assert.equal(qris.data.total, 10000);

  await call('PATCH', `/api/menu/${nasi.id}`, { token: owner, body: { price: 99000 } });
  const list = await call('GET', '/api/transactions', { token: owner });
  assert.equal(list.data.length, 2); // duplicate did not create a third
  const old = list.data.find((t) => t.id === cash.data.id);
  assert.equal(old.total, 35000);

  const dash = (await call('GET', '/api/dashboard', { token: owner })).data;
  assert.deepEqual([dash.totalSales, dash.count, dash.cash, dash.qris], [45000, 2, 35000, 10000]);
  assert.equal(dash.topItems[0].name, 'Es Teh'); // 3 sold vs 2 nasi goreng

  const search = await call('GET', '/api/transactions?q=nasi', { token: owner });
  assert.equal(search.data.length, 1);
});

test('cashier is limited, and a deactivated cashier loses access immediately', async () => {
  const owner = await newMerchant('c');
  const item = (await call('POST', '/api/menu', { token: owner, body: { name: 'Kopi', price: 8000 } })).data;
  const staff = (await call('POST', '/api/staff', { token: owner, body: { name: 'Sari', email: 'sari@x.id', password: 'kasirkasir' } })).data;
  const cashier = (await call('POST', '/api/auth/login', { body: { email: 'sari@x.id', password: 'kasirkasir' } })).data.token;

  assert.equal((await call('GET', '/api/dashboard', { token: cashier })).status, 403);
  assert.equal((await call('POST', '/api/menu', { token: cashier, body: { name: 'X', price: 1 } })).status, 403);
  assert.equal((await call('GET', '/api/staff', { token: cashier })).status, 403);
  const sale = await call('POST', '/api/transactions', { token: cashier, body: { clientId: 's1', method: 'qris', items: [{ menuItemId: item.id, qty: 1 }] } });
  assert.equal(sale.status, 201);
  assert.equal(sale.data.cashier, 'Sari');

  await call('PATCH', `/api/staff/${staff.id}`, { token: owner, body: { active: false } });
  assert.equal((await call('GET', '/api/menu', { token: cashier })).status, 401);
  assert.equal((await call('POST', '/api/auth/login', { body: { email: 'sari@x.id', password: 'kasirkasir' } })).status, 401);
  assert.equal((await call('GET', '/api/transactions', { token: owner })).data.length, 1); // history stays
});

test('deactivated menu item cannot be sold but stays in history', async () => {
  const owner = await newMerchant('d');
  const item = (await call('POST', '/api/menu', { token: owner, body: { name: 'Soto', price: 12000 } })).data;
  await call('POST', '/api/transactions', { token: owner, body: { clientId: 'd1', method: 'qris', items: [{ menuItemId: item.id, qty: 1 }] } });
  await call('PATCH', `/api/menu/${item.id}`, { token: owner, body: { active: false } });
  const r = await call('POST', '/api/transactions', { token: owner, body: { clientId: 'd2', method: 'qris', items: [{ menuItemId: item.id, qty: 1 }] } });
  assert.equal(r.status, 400);
  assert.equal((await call('GET', '/api/transactions', { token: owner })).data.length, 1);
});

test('merchants cannot see or touch each other\'s data', async () => {
  const a = await newMerchant('e1');
  const b = await newMerchant('e2');
  const item = (await call('POST', '/api/menu', { token: a, body: { name: 'Bakso', price: 10000 } })).data;
  assert.equal((await call('GET', '/api/menu', { token: b })).data.length, 0);
  assert.equal((await call('PATCH', `/api/menu/${item.id}`, { token: b, body: { price: 1 } })).status, 404);
  const sale = await call('POST', '/api/transactions', { token: b, body: { clientId: 'x', method: 'qris', items: [{ menuItemId: item.id, qty: 1 }] } });
  assert.equal(sale.status, 400);
});

test('QRIS upload validates the image', async () => {
  const owner = await newMerchant('f');
  assert.equal((await call('PUT', '/api/business/qris', { token: owner, body: { image: 'bukan gambar' } })).status, 400);
  const fake = 'data:image/png;base64,' + Buffer.from('this is not a png at all').toString('base64');
  assert.equal((await call('PUT', '/api/business/qris', { token: owner, body: { image: fake } })).status, 400);
  assert.equal((await call('PUT', '/api/business/qris', { token: owner, body: { image: PNG } })).status, 200);
  assert.equal((await call('GET', '/api/me', { token: owner })).data.business.qrisImage, PNG);
  assert.equal((await call('PUT', '/api/business/qris', { token: owner, body: { image: null } })).data.qrisImage, null);
});

test('tampered token is rejected', async () => {
  const owner = await newMerchant('g');
  const [body, mac] = owner.split('.');
  const forged = Buffer.from(JSON.stringify({ uid: 1, exp: Date.now() + 1e9 })).toString('base64url') + '.' + mac;
  assert.equal((await call('GET', '/api/me', { token: forged })).status, 401);
  assert.equal((await call('GET', '/api/me', { token: body })).status, 401);
});
