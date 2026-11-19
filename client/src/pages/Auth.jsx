import { useState } from 'react';
import { api } from '../api.js';

export default function Auth({ onAuth }) {
  const [mode, setMode] = useState('login');
  const [f, setF] = useState({ businessName: '', businessType: 'warung', name: '', email: '', password: '' });
  const [error, setError] = useState('');
  const [busy, setBusy] = useState(false);
  const set = (k) => (e) => setF({ ...f, [k]: e.target.value });

  async function submit(e) {
    e.preventDefault();
    setBusy(true);
    setError('');
    try {
      const session = mode === 'login'
        ? await api('POST', '/auth/login', { email: f.email, password: f.password })
        : await api('POST', '/auth/register', f);
      onAuth(session);
    } catch (err) {
      setError(err.message);
      setBusy(false);
    }
  }

  return (
    <div className="auth">
      <h1>Youthdi</h1>
      <p className="muted">Kasir gratis untuk warung dan usaha F&amp;B. Ganti buku catatan, tanpa ribet.</p>
      <form onSubmit={submit} className="card stack">
        <h2>{mode === 'login' ? 'Masuk' : 'Daftar usaha baru'}</h2>
        {mode === 'register' && (
          <>
            <label>Nama usaha<input required value={f.businessName} onChange={set('businessName')} /></label>
            <label>Jenis usaha
              <select value={f.businessType} onChange={set('businessType')}>
                <option value="warung">Warung</option>
                <option value="fnb">F&amp;B (kafe, resto kecil)</option>
              </select>
            </label>
            <label>Nama Anda<input required value={f.name} onChange={set('name')} /></label>
          </>
        )}
        <label>Email<input type="email" required value={f.email} onChange={set('email')} /></label>
        <label>Password{mode === 'register' && ' (minimal 8 karakter)'}
          <input type="password" required minLength={mode === 'register' ? 8 : undefined} value={f.password} onChange={set('password')} />
        </label>
        {error && <p className="error">{error}</p>}
        <button className="primary" disabled={busy}>{mode === 'login' ? 'Masuk' : 'Daftar'}</button>
        <button type="button" className="link" onClick={() => { setMode(mode === 'login' ? 'register' : 'login'); setError(''); }}>
          {mode === 'login' ? 'Belum punya akun? Daftar' : 'Sudah punya akun? Masuk'}
        </button>
      </form>
    </div>
  );
}
