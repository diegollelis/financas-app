import { useEffect, useState } from 'react';

/** Whether `ms` milliseconds have passed since the component mounted. */
export function useElapsed(ms: number) {
  const [elapsed, setElapsed] = useState(false);
  useEffect(() => {
    const timer = setTimeout(() => setElapsed(true), ms);
    return () => clearTimeout(timer);
  }, [ms]);
  return elapsed;
}
