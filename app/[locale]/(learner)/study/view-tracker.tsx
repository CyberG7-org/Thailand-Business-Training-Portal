'use client';

import { useEffect } from 'react';
import { markViewedAction } from './actions';

/** Records the open once the page has rendered on the client (idempotent server-side). */
export function ViewTracker({ materialId }: { materialId: string }) {
  useEffect(() => {
    void markViewedAction(materialId);
  }, [materialId]);
  return null;
}
