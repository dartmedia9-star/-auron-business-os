import { useEffect, useRef, useState } from "react";

/*
 * True for a moment after `signal` changes to a new truthy value, e.g. pass a
 * mutation's `submittedAt` or `isSuccess` to show a brief "Saved" state on
 * the button that triggered it.
 */
export function useFlash(signal: unknown, ms = 1600): boolean {
  const [on, setOn] = useState(false);
  const last = useRef(signal);
  useEffect(() => {
    if (signal && signal !== last.current) {
      setOn(true);
      const t = setTimeout(() => setOn(false), ms);
      last.current = signal;
      return () => clearTimeout(t);
    }
    last.current = signal;
    return undefined;
  }, [signal, ms]);
  return on;
}
