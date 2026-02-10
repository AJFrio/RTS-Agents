import React from 'react';

const PROVIDER_CLASS = {
  gemini: 'provider-badge gemini border-emerald-500 text-emerald-500',
  jules: 'provider-badge jules border-primary text-primary',
  cursor: 'provider-badge cursor border-blue-500 text-blue-500',
  codex: 'provider-badge codex border-cyan-500 text-cyan-500',
  'claude-cli': 'provider-badge border-orange-500 text-orange-500',
  'claude-cloud': 'provider-badge border-amber-500 text-amber-500',
  claude: 'provider-badge border-orange-500 text-orange-500',
};

const STATUS_CLASS = {
  running: 'status-badge running bg-yellow-500/20 text-yellow-500',
  completed: 'status-badge completed bg-primary text-black',
  pending: 'status-badge pending bg-slate-700 text-slate-400',
  failed: 'status-badge failed bg-red-500/20 text-red-500',
  stopped: 'status-badge stopped bg-red-500/20 text-red-500',
};

export function ProviderBadge({ provider, children }) {
  const c = PROVIDER_CLASS[provider] || 'provider-badge border-slate-500 text-slate-500';
  return <span className={c}>{children ?? provider?.toUpperCase()}</span>;
}

export function StatusBadge({ status, children }) {
  const key = status === 'stopped' ? 'failed' : status;
  const c = STATUS_CLASS[key] || 'status-badge pending bg-slate-700 text-slate-400';
  return <span className={c}>{children ?? status}</span>;
}
