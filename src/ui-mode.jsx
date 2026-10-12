import React, { createContext, useContext, useEffect, useState } from 'react';

// Two versions of the interface: "normal" (default, few steps, no values, no factory options) and
// "expert" (every step, live values, factory values, communication log).
const KEY = 't3cal.ui';
const UiModeContext = createContext({ uiMode: 'normal', setUiMode: () => {} });
export const useUiMode = () => useContext(UiModeContext);

function initialMode() {
  try {
    const fromUrl = new URLSearchParams(window.location.search).get('mode');
    if (fromUrl === 'expert' || fromUrl === 'normal') return fromUrl;
    const saved = localStorage.getItem(KEY);
    if (saved === 'expert' || saved === 'normal') return saved;
  } catch { /* storage unavailable */ }
  return 'normal';
}

export function UiModeProvider({ children }) {
  const [uiMode, setUiModeState] = useState(initialMode);
  const setUiMode = (m) => {
    setUiModeState(m);
    try { localStorage.setItem(KEY, m); } catch { /* ignore */ }
    try { // an explicit ?mode= in the address must not override the choice made in the page
      const url = new URL(window.location.href);
      if (url.searchParams.has('mode')) { url.searchParams.delete('mode'); window.history.replaceState(null, '', url); }
    } catch { /* ignore */ }
  };
  useEffect(() => { document.documentElement.dataset.ui = uiMode; }, [uiMode]);
  return <UiModeContext.Provider value={{ uiMode, setUiMode }}>{children}</UiModeContext.Provider>;
}
