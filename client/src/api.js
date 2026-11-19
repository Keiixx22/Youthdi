import { useCallback, useEffect, useState } from 'react';

const KEY = 'youthdi_token';
export const getToken = () => localStorage.getItem(KEY);
export const setToken = (t) => (t ? localStorage.setItem(KEY, t) : localStorage.removeItem(KEY));

export async function api(method, path, body) {
  let res;
  try {
    res = await fetch('/api' + path, {
      method,
      headers: { 'Content-Type': 'application/json', ...(getToken() && { Authorization: 'Bearer ' + getToken() }) },
      body: body === undefined ? undefined : JSON.stringify(body),
    });
  } catch {
    throw new Error('Tidak ada koneksi internet. Coba lagi sebentar.');
  }
  const data = await res.json().catch(() => ({}));
  if (res.status === 401 && getToken()) {
    setToken(null);
    window.dispatchEvent(new Event('youthdi:logout'));
  }
  if (!res.ok) throw new Error(data.error || 'Terjadi kesalahan');
  return data;
}

// Loads data when deps change. `reload()` refetches.
export function useLoad(fn, deps) {
  const [state, setState] = useState({ data: null, error: '', loading: true });
  // eslint-disable-next-line react-hooks/exhaustive-deps
  const load = useCallback(() => {
    setState((s) => ({ ...s, loading: true, error: '' }));
    fn().then(
      (data) => setState({ data, error: '', loading: false }),
      (e) => setState({ data: null, error: e.message, loading: false }),
    );
  }, deps);
  useEffect(() => {
    load();
  }, [load]);
  return { ...state, reload: load };
}
