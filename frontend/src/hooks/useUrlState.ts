import { useSearchParams } from "react-router-dom";
import { useCallback, useEffect, useRef, useState } from "react";

export function useUrlState<T>(key: string, defaultValue: T, options?: { serialize?: (value: T) => string; deserialize?: (value: string) => T }) {
  const [searchParams, setSearchParams] = useSearchParams();
  const isInitialized = useRef(false);
  const [value, setValue] = useState<T>(() => {
    const param = searchParams.get(key);
    if (param === null) return defaultValue;
    try {
      return options?.deserialize ? options.deserialize(param) : JSON.parse(param) as T;
    } catch {
      return defaultValue;
    }
  });

  useEffect(() => {
    if (!isInitialized.current) {
      isInitialized.current = true;
      return;
    }
    const newParams = new URLSearchParams(searchParams);
    if (value === defaultValue) {
      newParams.delete(key);
    } else {
      newParams.set(key, options?.serialize ? options.serialize(value) : JSON.stringify(value));
    }
    setSearchParams(newParams, { replace: true });
  }, [value, key, searchParams, setSearchParams, defaultValue, options]);

  const setUrlValue = useCallback((newValue: T | ((prev: T) => T)) => {
    setValue((prev) => {
      const resolved = typeof newValue === "function" ? (newValue as (prev: T) => T)(prev) : newValue;
      return resolved;
    });
  }, []);

  return [value, setUrlValue] as const;
}

export function useUrlStringState(key: string, defaultValue: string = "") {
  return useUrlState(key, defaultValue, {
    serialize: (v) => v,
    deserialize: (v) => v,
  });
}

export function useUrlNumberState(key: string, defaultValue: number = 0) {
  return useUrlState(key, defaultValue, {
    serialize: (v) => String(v),
    deserialize: (v) => Number(v),
  });
}

export function useUrlBooleanState(key: string, defaultValue: boolean = false) {
  return useUrlState(key, defaultValue, {
    serialize: (v) => v ? "true" : "false",
    deserialize: (v) => v === "true",
  });
}

export function useUrlArrayState<T>(key: string, defaultValue: T[] = []) {
  return useUrlState(key, defaultValue, {
    serialize: (v) => JSON.stringify(v),
    deserialize: (v) => {
      try {
        const parsed = JSON.parse(v);
        return Array.isArray(parsed) ? parsed : defaultValue;
      } catch {
        return defaultValue;
      }
    },
  });
}