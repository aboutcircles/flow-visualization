import { useState, useEffect } from 'react';

const STORAGE_PREFIX = 'flow-viz-ui-';

export function usePersistedState(key, defaultValue) {
  const storageKey = STORAGE_PREFIX + key;

  const [value, setValue] = useState(() => {
    try {
      const stored = localStorage.getItem(storageKey);
      return stored !== null ? JSON.parse(stored) : defaultValue;
    } catch {
      return defaultValue;
    }
  });

  useEffect(() => {
    try {
      localStorage.setItem(storageKey, JSON.stringify(value));
    } catch {}
  }, [storageKey, value]);

  return [value, setValue];
}
