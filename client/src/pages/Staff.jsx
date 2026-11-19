import { useState } from 'react';
import { api, useLoad } from '../api.js';

export default function Staff() {
  const { data, error, reload } = useLoad(() => api('GET', '/staff'), []);
  const [form, setForm] = useState({ name: '', email: '', password: '', role: 'cashier' });
  const [msg, setMsg] = useState('');
  const set = (k) => (e) => setForm({ ...form, [k]: e.target.value });

  async function act(fn) {
    setMsg('');
    try {
      await fn();
      reload();
    } catch (e) {
      setMsg(e.message);
    }
  }

  const add = (e) => {
    e.preventDefault();
    act(async () => {
      await api('POST', '/staff', form);
      setForm({ name: '', email: '', password: '', role: 'cashier' });
    });
  };

  return (
    <div className="stack">
      <h2>Staf</h2>
      <form className="card toolbar" onSubmit={add}>
        <label>Nama<input required value={form.name} onChange={set('name')} /></label>
        <label>Email<input type="email" required value={form.email} onChange={set('email')} /></label>
        <label>Password<input type="password" required minLength={8} value={form.password} onChange={set('password')} /></label>
        <label>Peran
          <select value={form.role} onChange={set('role')}>
            <option value="cashier">Kasir</option>
            <option value="owner">Pemilik</option>
          </select>
        </label>
        <button className="primary">Tambah</button>
      </form>
      {(error || msg) && <p className="error">{error || msg}</p>}
      {data && (
        <div className="table-wrap">
          <table>
            <thead><tr><th>Nama</th><th>Email</th><th>Peran</th><th></th></tr></thead>
            <tbody>
              {data.map((u) => (
                <tr key={u.id} className={u.active ? '' : 'inactive'}>
                  <td>{u.name}{!u.active && ' (nonaktif)'}</td><td>{u.email}</td><td>{u.role === 'owner' ? 'Pemilik' : 'Kasir'}</td>
                  <td className="actions">
                    <button onClick={() => act(() => api('PATCH', `/staff/${u.id}`, { active: !u.active }))}>{u.active ? 'Nonaktifkan' : 'Aktifkan'}</button>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
      <p className="muted small">Setiap staf punya login sendiri. Akun yang dinonaktifkan langsung keluar, dan transaksi lamanya tetap tercatat.</p>
    </div>
  );
}
