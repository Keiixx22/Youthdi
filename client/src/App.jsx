import { useEffect, useState } from 'react';
import { api, getToken, setToken } from './api.js';
import Auth from './pages/Auth.jsx';
import Cashier from './pages/Cashier.jsx';
import Dashboard from './pages/Dashboard.jsx';
import History from './pages/History.jsx';
import Menu from './pages/Menu.jsx';
import Staff from './pages/Staff.jsx';
import Settings from './pages/Settings.jsx';

const OWNER_TABS = [
  ['kasir', 'Kasir'],
  ['dashboard', 'Dashboard'],
  ['riwayat', 'Riwayat'],
  ['menu', 'Menu'],
  ['staf', 'Staf'],
  ['pengaturan', 'Pengaturan'],
];

export default function App() {
  const [me, setMe] = useState(null); // { user, business }
  const [booting, setBooting] = useState(!!getToken());
  const [tab, setTab] = useState('kasir');
  const [online, setOnline] = useState(navigator.onLine);

  useEffect(() => {
    if (getToken()) {
      api('GET', '/me').then(setMe, () => {}).finally(() => setBooting(false));
    }
    const logout = () => setMe(null);
    const up = () => setOnline(true);
    const down = () => setOnline(false);
    window.addEventListener('youthdi:logout', logout);
    window.addEventListener('online', up);
    window.addEventListener('offline', down);
    return () => {
      window.removeEventListener('youthdi:logout', logout);
      window.removeEventListener('online', up);
      window.removeEventListener('offline', down);
    };
  }, []);

  if (booting) return <p className="center muted">Memuat…</p>;
  if (!me) return <Auth onAuth={(session) => { setToken(session.token); api('GET', '/me').then(setMe); }} />;

  const isOwner = me.user.role === 'owner';
  const refreshMe = () => api('GET', '/me').then(setMe);
  const logout = () => { setToken(null); setMe(null); setTab('kasir'); };

  return (
    <div className="app">
      {!online && <div className="banner">Tidak ada koneksi internet. Pesanan di layar tetap tersimpan.</div>}
      <header className="topbar no-print">
        <strong>{me.business.name}</strong>
        <nav>
          {isOwner
            ? OWNER_TABS.map(([id, label]) => (
                <button key={id} className={tab === id ? 'tab active' : 'tab'} onClick={() => setTab(id)}>{label}</button>
              ))
            : <span className="tab active">Kasir</span>}
        </nav>
        <span className="who">{me.user.name} · <button className="link" onClick={logout}>Keluar</button></span>
      </header>
      <main>
        {tab === 'kasir' && <Cashier business={me.business} />}
        {isOwner && tab === 'dashboard' && <Dashboard />}
        {isOwner && tab === 'riwayat' && <History />}
        {isOwner && tab === 'menu' && <Menu />}
        {isOwner && tab === 'staf' && <Staff />}
        {isOwner && tab === 'pengaturan' && <Settings business={me.business} onChange={refreshMe} />}
      </main>
    </div>
  );
}
