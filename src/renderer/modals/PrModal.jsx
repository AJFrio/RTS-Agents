import React, { useState, useEffect } from 'react';
import Modal from '../components/ui/Modal.jsx';
import Button from '../components/ui/Button.jsx';
import { useApp } from '../context/AppContext.jsx';
import DOMPurify from 'dompurify';

export default function PrModal({ pr, onClose, api }) {
  const { loadAgents, removePr } = useApp();
  const [details, setDetails] = useState(null);
  const [merging, setMerging] = useState(false);
  const [checks, setChecks] = useState(null);
  const [checksExpanded, setChecksExpanded] = useState(false);

  const owner = pr?.base?.repo?.owner?.login || pr?.head?.repo?.owner?.login;
  const repoName = pr?.base?.repo?.name || pr?.head?.repo?.name;
  const prNumber = pr?.number;

  useEffect(() => {
    if (!pr || !api?.github?.getPrDetails || !owner || !repoName) return;

    const fetchDetails = () => {
      api.github
        .getPrDetails(owner, repoName, prNumber)
        .then((res) => res?.pr && setDetails(res.pr))
        .catch(console.error);
    };

    fetchDetails();
    const interval = setInterval(fetchDetails, 1000);

    return () => clearInterval(interval);
  }, [pr?.id, owner, repoName, prNumber, api]);

  const data = details || pr;
  const headSha = data?.head?.sha;
  const mergeable = data?.mergeable === true;
  const state = data?.state || 'open';

  useEffect(() => {
    if (!api?.github?.getPrChecks || !owner || !repoName || !headSha) return;

    let cancelled = false;
    const fetchChecks = () => {
      api.github
        .getPrChecks(owner, repoName, headSha)
        .then((res) => {
          if (!cancelled && res?.success) setChecks(res.checks || []);
        })
        .catch(console.error);
    };

    fetchChecks();
    const interval = setInterval(fetchChecks, 5000);

    return () => {
      cancelled = true;
      clearInterval(interval);
    };
  }, [owner, repoName, headSha, api]);

  const checksSummary = (() => {
    if (!Array.isArray(checks)) return { loading: true, total: 0, passed: 0, failed: 0, pending: 0, neutral: 0 };
    let passed = 0;
    let failed = 0;
    let pending = 0;
    let neutral = 0;
    for (const c of checks) {
      if (c.status !== 'completed') {
        pending += 1;
        continue;
      }
      if (c.conclusion === 'success') passed += 1;
      else if (c.conclusion === 'failure' || c.conclusion === 'timed_out' || c.conclusion === 'action_required') failed += 1;
      else neutral += 1;
    }
    return { loading: false, total: checks.length, passed, failed, pending, neutral };
  })();

  const checksIcon = checksSummary.loading
    ? { name: 'sync', cls: 'text-slate-400 animate-spin' }
    : checksSummary.total === 0
    ? { name: 'remove_circle', cls: 'text-slate-400' }
    : checksSummary.failed > 0
    ? { name: 'cancel', cls: 'text-red-500' }
    : checksSummary.pending > 0
    ? { name: 'pending', cls: 'text-yellow-500' }
    : { name: 'check_circle', cls: 'text-emerald-500' };

  const checkConclusionStyle = (c) => {
    if (c.status !== 'completed') return { icon: 'pending', cls: 'text-yellow-500' };
    switch (c.conclusion) {
      case 'success':
        return { icon: 'check_circle', cls: 'text-emerald-500' };
      case 'failure':
      case 'timed_out':
      case 'action_required':
        return { icon: 'cancel', cls: 'text-red-500' };
      case 'cancelled':
        return { icon: 'block', cls: 'text-slate-400' };
      case 'skipped':
        return { icon: 'skip_next', cls: 'text-slate-400' };
      case 'neutral':
      default:
        return { icon: 'remove_circle', cls: 'text-slate-400' };
    }
  };

  const handleMerge = async () => {
    if (!api?.github?.mergePr || !owner || !repoName) return;
    setMerging(true);
    try {
      await api.github.mergePr(owner, repoName, prNumber, 'merge');
      removePr(pr.id);
      onClose();
      loadAgents();
    } finally {
      setMerging(false);
    }
  };

  const handleClosePr = async () => {
    if (!api?.github?.closePr || !owner || !repoName) return;
    setMerging(true);
    try {
      await api.github.closePr(owner, repoName, prNumber);
      removePr(pr.id);
      onClose();
      loadAgents();
    } finally {
      setMerging(false);
    }
  };

  if (!pr) return null;

  return (
    <Modal open={!!pr} onClose={onClose}>
      <div id="pr-modal" className="bg-white dark:bg-sidebar-dark border border-slate-200 dark:border-border-dark w-full max-w-4xl max-h-[90vh] overflow-hidden flex flex-col shadow-2xl rounded-2xl">
        <div className="p-6 border-b border-slate-200 dark:border-border-dark flex justify-between items-start bg-white dark:bg-black/40">
          <div className="flex-1 mr-8">
            <div className="flex items-center gap-3 mb-2">
              <span id="pr-modal-number" className="text-slate-500 technical-font text-sm">#{pr.number}</span>
              <span
                id="pr-modal-state"
                className={`px-2 py-0.5 text-[10px] technical-font font-bold ${
                  state === 'open'
                    ? 'bg-emerald-500/20 text-emerald-500'
                    : 'bg-slate-200 dark:bg-slate-700 text-slate-700 dark:text-slate-300'
                }`}
              >
                {state.toUpperCase()}
              </span>
            </div>
            <h2 id="pr-modal-title" className="text-xl font-display font-bold text-slate-900 dark:text-white tracking-tight leading-tight">
              {data?.title || 'Loading...'}
            </h2>
          </div>
          <button type="button" onClick={onClose} className="text-slate-500 hover:text-slate-700 dark:hover:text-primary transition-colors">
            <span className="material-symbols-outlined">close</span>
          </button>
        </div>
        <div className="flex-1 overflow-y-auto p-8 bg-white dark:bg-background-dark">
          <div className="grid grid-cols-2 gap-4 mb-8">
            <div className="bg-slate-50 dark:bg-[#1A1A1A] border border-slate-200 dark:border-border-dark p-4">
              <div className="text-[9px] technical-font text-slate-500 mb-1">SOURCE</div>
              <div id="pr-modal-head" className="text-xs font-mono text-primary">{data?.head?.ref ?? '—'}</div>
            </div>
            <div className="bg-slate-50 dark:bg-[#1A1A1A] border border-slate-200 dark:border-border-dark p-4">
              <div className="text-[9px] technical-font text-slate-500 mb-1">TARGET</div>
              <div id="pr-modal-base" className="text-xs font-mono text-slate-600 dark:text-slate-300">{data?.base?.ref ?? '—'}</div>
            </div>
          </div>
          <div className="mb-8">
            <h3 className="text-[11px] technical-font text-slate-500 font-bold mb-3 border-b border-slate-200 dark:border-border-dark pb-2">DESCRIPTION</h3>
            <div
              id="pr-modal-body"
              className="prose dark:prose-invert prose-sm max-w-none text-slate-600 dark:text-slate-300 font-light leading-relaxed"
              dangerouslySetInnerHTML={{ __html: DOMPurify.sanitize(data?.body ? data.body.replace(/\n/g, '<br/>') : '—') }}
            />
          </div>
          <div id="pr-modal-checks" className="bg-slate-50 dark:bg-[#1A1A1A] border border-slate-200 dark:border-border-dark mb-4">
            <button
              type="button"
              onClick={() => setChecksExpanded((v) => !v)}
              disabled={!checksSummary.loading && checksSummary.total === 0}
              className="w-full p-4 flex items-center justify-between text-left disabled:cursor-default"
            >
              <div className="flex items-center gap-3">
                <span className={`material-symbols-outlined ${checksIcon.cls}`}>{checksIcon.name}</span>
                <div>
                  <div className="text-sm font-bold text-slate-900 dark:text-white">
                    {checksSummary.loading
                      ? 'Loading checks…'
                      : checksSummary.total === 0
                      ? 'No checks reported for this branch'
                      : checksSummary.failed > 0
                      ? `${checksSummary.failed} failing`
                      : checksSummary.pending > 0
                      ? `${checksSummary.pending} pending`
                      : 'All checks passed'}
                  </div>
                  {!checksSummary.loading && checksSummary.total > 0 && (
                    <div className="text-xs text-slate-500 flex items-center gap-3">
                      <span className="flex items-center gap-1">
                        <span className="material-symbols-outlined text-[14px] text-emerald-500">check_circle</span>
                        {checksSummary.passed} passed
                      </span>
                      {checksSummary.failed > 0 && (
                        <span className="flex items-center gap-1">
                          <span className="material-symbols-outlined text-[14px] text-red-500">cancel</span>
                          {checksSummary.failed} failed
                        </span>
                      )}
                      {checksSummary.pending > 0 && (
                        <span className="flex items-center gap-1">
                          <span className="material-symbols-outlined text-[14px] text-yellow-500">pending</span>
                          {checksSummary.pending} pending
                        </span>
                      )}
                      {checksSummary.neutral > 0 && (
                        <span className="flex items-center gap-1">
                          <span className="material-symbols-outlined text-[14px] text-slate-400">remove_circle</span>
                          {checksSummary.neutral} other
                        </span>
                      )}
                    </div>
                  )}
                </div>
              </div>
              {!checksSummary.loading && checksSummary.total > 0 && (
                <span className="material-symbols-outlined text-slate-500">
                  {checksExpanded ? 'expand_less' : 'expand_more'}
                </span>
              )}
            </button>
            {checksExpanded && checksSummary.total > 0 && (
              <ul className="border-t border-slate-200 dark:border-border-dark divide-y divide-slate-200 dark:divide-border-dark">
                {checks.map((c) => {
                  const style = checkConclusionStyle(c);
                  return (
                    <li key={c.id} className="px-4 py-2 flex items-center justify-between gap-3">
                      <div className="flex items-center gap-3 min-w-0">
                        <span className={`material-symbols-outlined text-[18px] ${style.cls}`}>{style.icon}</span>
                        <div className="min-w-0">
                          <div className="text-xs font-medium text-slate-900 dark:text-white truncate">{c.name}</div>
                          {c.appName && (
                            <div className="text-[10px] technical-font text-slate-500 truncate">{c.appName}</div>
                          )}
                        </div>
                      </div>
                      <div className="flex items-center gap-2 shrink-0">
                        <span className="text-[10px] technical-font text-slate-500 uppercase">
                          {c.status === 'completed' ? c.conclusion || 'neutral' : c.status.replace('_', ' ')}
                        </span>
                        {c.url && (
                          <button
                            type="button"
                            onClick={() => api?.openExternal?.(c.url)}
                            className="text-slate-500 hover:text-primary"
                            title="Open details"
                          >
                            <span className="material-symbols-outlined text-[16px]">open_in_new</span>
                          </button>
                        )}
                      </div>
                    </li>
                  );
                })}
              </ul>
            )}
          </div>
          <div className="bg-slate-50 dark:bg-[#1A1A1A] border border-slate-200 dark:border-border-dark p-4 flex items-center justify-between">
            <div className="flex items-center gap-3">
              <span className={`material-symbols-outlined ${mergeable ? 'text-emerald-500' : 'text-yellow-500'}`}>
                {mergeable ? 'check_circle' : 'warning'}
              </span>
              <div>
                <div className="text-sm font-bold text-slate-900 dark:text-white">
                  {mergeable ? 'This branch has no conflicts with the base branch' : 'Merge status may vary'}
                </div>
                <div className="text-xs text-slate-500">Merging can be performed automatically.</div>
              </div>
            </div>
            <div className="flex items-center gap-2">
              {state === 'open' && (
                <>
                  <Button id="merge-github-btn" variant="secondary" onClick={() => api?.openExternal?.(data?.html_url)}>
                    <span className="material-symbols-outlined text-sm">open_in_new</span>
                    GITHUB
                  </Button>
                  <Button variant="danger" onClick={handleClosePr} disabled={merging}>
                    CLOSE PR
                  </Button>
                  <Button id="merge-btn" variant="primary" onClick={handleMerge} disabled={!mergeable || merging}>
                    <span className="material-symbols-outlined text-sm">merge</span>
                    MERGE
                  </Button>
                </>
              )}
            </div>
          </div>
        </div>
        <div className="p-4 bg-slate-50 dark:bg-black border-t border-slate-200 dark:border-border-dark flex justify-between items-center text-[10px] technical-font">
          <a
            id="pr-modal-link"
            href={data?.html_url}
            target="_blank"
            rel="noopener noreferrer"
            className="text-slate-500 hover:text-primary flex items-center gap-1"
            onClick={(e) => {
              e.preventDefault();
              api?.openExternal?.(data?.html_url);
            }}
          >
            <span className="material-symbols-outlined text-xs">open_in_new</span>
            OPEN IN BROWSER
          </a>
          <span id="pr-modal-meta" className="text-slate-600">Updated {data?.updated_at ?? ''}</span>
        </div>
      </div>
    </Modal>
  );
}
