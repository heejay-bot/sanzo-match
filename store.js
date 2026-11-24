// Storage layer. In the native app (Capacitor) data lives in app-private
// storage (Android SharedPreferences / iOS UserDefaults) via the Preferences
// plugin; on the web it falls back to localStorage. Everything is loaded into
// memory once at startup so reads stay synchronous.
const Pref = window.Capacitor?.isNativePlatform?.() ? window.Capacitor.Plugins.Preferences : null;
const KEYS = ['sanzo-favs', 'sanzo-items', 'sanzo-outfits'];
const cache = {};

for (const k of KEYS) {
  let v = null;
  if (Pref) {
    v = (await Pref.get({ key: k })).value;
    // one-time migration from the WebView's localStorage
    if (v == null && localStorage.getItem(k) != null) {
      v = localStorage.getItem(k);
      await Pref.set({ key: k, value: v });
    }
  } else {
    v = localStorage.getItem(k);
  }
  try { cache[k] = JSON.parse(v || '[]'); } catch { cache[k] = []; }
}

export const isNative = !!Pref;
export const load = (k) => cache[k] ?? [];
export function save(k, data) {
  cache[k] = data;
  const s = JSON.stringify(data);
  if (Pref) Pref.set({ key: k, value: s });
  else localStorage.setItem(k, s);
}

// Export a backup: share sheet in the app, file download on the web.
export async function exportFile(name, text) {
  const P = window.Capacitor?.Plugins;
  if (Pref && P?.Filesystem && P?.Share) {
    const { uri } = await P.Filesystem.writeFile({ path: name, data: text, directory: 'CACHE', encoding: 'utf8' });
    await P.Share.share({ title: name, files: [uri] });
    return;
  }
  const a = document.createElement('a');
  a.href = URL.createObjectURL(new Blob([text], { type: 'application/json' }));
  a.download = name;
  a.click(); setTimeout(() => URL.revokeObjectURL(a.href), 1000);
}
