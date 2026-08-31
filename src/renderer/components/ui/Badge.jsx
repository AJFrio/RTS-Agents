import React from 'react';
import { statusMeta } from './status.jsx';

/**
 * Badges (DESIGN.md §2.5/§3.1): provider identity is typography only —
 * neutral hairline pill. Status color carries state semantics exclusively
 * (emerald good, amber queued, red bad, grey idle).
 */
export function ProviderBadge({ provider, children }) {
  return <span className="provider-badge">{children ?? provider?.toUpperCase()}</span>;
}

export function StatusBadge({ status, children }) {
  const key = status === 'stopped' ? 'failed' : status;
  const meta = statusMeta(key);
  return (
    <span className={`status-badge ${meta.bg} ${meta.text}`}>{children ?? status}</span>
  );
}
