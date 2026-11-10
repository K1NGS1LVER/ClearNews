import { useCallback, useEffect, useRef, useState } from "react";
import { useLocation, useSearchParams } from "react-router-dom";

export function useScrollRestoration(key: string) {
  const location = useLocation();
  const scrollPositionRef = useRef<number>(0);
  const isRestoredRef = useRef(false);

  const storageKey = `scroll-${key}-${location.pathname}`;

  useEffect(() => {
    if (isRestoredRef.current) return;

    const savedPosition = sessionStorage.getItem(storageKey);
    if (savedPosition) {
      const position = parseInt(savedPosition, 10);
      if (!isNaN(position)) {
        setTimeout(() => {
          window.scrollTo(0, position);
        }, 0);
      }
    }
    isRestoredRef.current = true;
  }, [location.pathname, storageKey]);

  useEffect(() => {
    const handleScroll = () => {
      scrollPositionRef.current = window.scrollY;
    };

    window.addEventListener("scroll", handleScroll, { passive: true });
    return () => window.removeEventListener("scroll", handleScroll);
  }, []);

  useEffect(() => {
    return () => {
      sessionStorage.setItem(storageKey, String(scrollPositionRef.current));
    };
  }, [storageKey]);

  return scrollPositionRef;
}

export function usePageState<T>(key: string, defaultValue: T) {
  const [searchParams, setSearchParams] = useSearchParams();
  const storageKey = `page-state-${key}`;
  
  const [value, setValue] = useState<T>(() => {
    const urlParam = searchParams.get(key);
    if (urlParam !== null) {
      try {
        return JSON.parse(urlParam) as T;
      } catch {
        return defaultValue;
      }
    }
    
    const saved = sessionStorage.getItem(storageKey);
    if (saved !== null) {
      try {
        return JSON.parse(saved) as T;
      } catch {
        return defaultValue;
      }
    }
    
    return defaultValue;
  });

  const setUrlValue = useCallback((newValue: T | ((prev: T) => T)) => {
    setValue((prev) => {
      const resolved = typeof newValue === "function" ? (newValue as (prev: T) => T)(prev) : newValue;
      
      const newParams = new URLSearchParams(searchParams);
      if (JSON.stringify(resolved) === JSON.stringify(defaultValue)) {
        newParams.delete(key);
      } else {
        newParams.set(key, JSON.stringify(resolved));
      }
      setSearchParams(newParams, { replace: true });
      
      sessionStorage.setItem(storageKey, JSON.stringify(resolved));
      
      return resolved;
    });
  }, [key, searchParams, setSearchParams, defaultValue]);

  return [value, setUrlValue] as const;
}