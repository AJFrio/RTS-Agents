import { useEffect, useState } from 'react';
import { LG_MIN_WIDTH, MD_MIN_WIDTH } from '../utils/mobile-nav.js';

function getMatches(query) {
  if (typeof window === 'undefined' || typeof window.matchMedia !== 'function') {
    return false;
  }
  return window.matchMedia(query).matches;
}

export function useMediaQuery(query) {
  const [matches, setMatches] = useState(() => getMatches(query));

  useEffect(() => {
    if (typeof window === 'undefined' || typeof window.matchMedia !== 'function') {
      return undefined;
    }
    const mql = window.matchMedia(query);
    const handleChange = (event) => setMatches(event.matches);
    setMatches(mql.matches);
    mql.addEventListener('change', handleChange);
    return () => mql.removeEventListener('change', handleChange);
  }, [query]);

  return matches;
}

export function useBelowMd() {
  return useMediaQuery(`(max-width: ${MD_MIN_WIDTH - 1}px)`);
}

export function useBelowLg() {
  return useMediaQuery(`(max-width: ${LG_MIN_WIDTH - 1}px)`);
}
