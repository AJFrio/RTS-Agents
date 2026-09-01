import React, { useState, useEffect } from 'react';
import Modal from '../components/ui/Modal.jsx';
import Button from '../components/ui/Button.jsx';
import {
  IconSync,
  IconCheck,
  IconAlert,
  IconClock,
  IconStop,
  IconClose,
  IconExternal,
  IconGitBranch,
  IconChevronDown,
} from '../components/ui/icons.jsx';
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
    ? { Icon: IconSync, cls: 'text-neutral-400 animate-spin' }
    : checksSummary.total === 0
    ? { Icon: IconClock, cls: 'text-neutral-400' }
    : checksSummary.failed > 0
    ? { Icon: IconAlert, cls: 'text-red-600 dark:text-red-400' }
    : checksSummary.pending > 0
    ? { Icon: IconClock, cls: 'text-amber-600 dark:text-amber-400' }
    : { Icon: IconCheck, cls: 'text-emerald-600 dark:text-emerald-400' };

  const checkConclusionStyle = (c) => {
    if (c.status !== 'completed') return { Icon: IconClock, cls: 'text-amber-600 dark:text-amber-400' };
    switch (c.conclusion) {
      case 'success':
        return { Icon: IconCheck, cls: 'text-emerald-600 dark:text-emerald-400' };
      case 'failure':
      case 'timed_out':
      case 'action_required':
        return { Icon: IconAlert, cls: 'text-red-600 dark:text-red-400' };
      case 'cancelled':
        return { Icon: IconStop, cls: 'text-neutral-400' };
      case 'skipped':
        return { Icon: IconChevronDown, cls: 'text-neutral-400' };
      case 'neutral':
      default:
        return { Icon: IconClock, cls: 'text-neutral-400' };
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
    <Modal open={!!pr} onClose={onClose} size="lg">
      <div id="pr-modal" className="flex max-h-[90vh] w-full flex-col">
        <div className="flex shrink-0 items-start justify-between gap-3 border-b border-border-light px-4 py-3 dark:border-border-dark">
          <div className="min-w-0 flex-1">
            <div className="mb-1 flex items-center gap-2.5">
              <span id="pr-modal-number" className="technical-font text-[11px] text-neutral-500 dark:text-neutral-400">#{pr.number}</span>
              <span
                id="pr-modal-state"
                className={`rounded-full px-2 py-0.5 text-[10px] technical-font font-semibold ${
                  state === 'open'
                    ? 'bg-emerald-500/10 text-emerald-700 dark:text-emerald-400'
                    : 'bg-neutral-400/10 text-neutral-500 dark:text-neutral-400'
                }`}
              >
                {state.toUpperCase()}
              </span>
            </div>
            <h2 id="pr-modal-title" className="text-[15px] font-semibold text-neutral-900 dark:text-neutral-100 leading-snug">
              {data?.title || 'Loading...'}
            </h2>
          </div>
          <button
            type="button"
            onClick={onClose}
            aria-label="Close pull request details"
            className="rounded-md p-1.5 text-neutral-500 transition-colors hover:bg-neutral-100 hover:text-neutral-900 dark:hover:bg-neutral-800 dark:hover:text-neutral-100"
          >
            <IconClose size={16} />
          </button>
        </div>
        <div className="flex-1 overflow-y-auto p-4">
          <div className="mb-5 grid grid-cols-2 gap-3">
            <div className="rounded-md border border-border-light bg-inset-light p-3 dark:border-border-dark dark:bg-inset-dark">
              <div className="technical-font mb-1 text-[10px] text-neutral-500 dark:text-neutral-400">SOURCE</div>
              <div id="pr-modal-head" className="font-mono text-xs text-neutral-900 dark:text-neutral-100">{data?.head?.ref ?? '—'}</div>
            </div>
            <div className="rounded-md border border-border-light bg-inset-light p-3 dark:border-border-dark dark:bg-inset-dark">
              <div className="technical-font mb-1 text-[10px] text-neutral-500 dark:text-neutral-400">TARGET</div>
              <div id="pr-modal-base" className="font-mono text-xs text-neutral-600 dark:text-neutral-300">{data?.base?.ref ?? '—'}</div>
            </div>
          </div>
          <div className="mb-5">
            <h3 className="technical-font mb-2 border-b border-border-light pb-1.5 text-[11px] font-semibold text-neutral-500 dark:border-border-dark dark:text-neutral-400">DESCRIPTION</h3>
            <div
              id="pr-modal-body"
              className="prose prose-sm max-w-none leading-relaxed text-neutral-600 dark:prose-invert dark:text-neutral-300"
              dangerouslySetInnerHTML={{ __html: DOMPurify.sanitize(data?.body ? data.body.replace(/\n/g, '<br/>') : '—') }}
            />
          </div>
          <div id="pr-modal-checks" className="mb-3 rounded-md border border-border-light bg-inset-light dark:border-border-dark dark:bg-inset-dark">
            <button
              type="button"
              onClick={() => setChecksExpanded((v) => !v)}
              disabled={!checksSummary.loading && checksSummary.total === 0}
              className="flex w-full items-center justify-between p-3 text-left disabled:cursor-default"
            >
              <div className="flex items-center gap-2.5">
                {(() => { const { Icon, cls } = checksIcon; return <Icon size={16} className={`shrink-0 ${cls}`} />; })()}
                <div>
                  <div className="text-[13px] font-semibold text-neutral-900 dark:text-neutral-100">
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
                    <div className="mt-0.5 flex items-center gap-3 text-[11px] text-neutral-500 dark:text-neutral-400">
                      <span className="flex items-center gap-1">
                        <IconCheck size={12} className="text-emerald-600 dark:text-emerald-400" />
                        {checksSummary.passed} passed
                      </span>
                      {checksSummary.failed > 0 && (
                        <span className="flex items-center gap-1">
                          <IconAlert size={12} className="text-red-600 dark:text-red-400" />
                          {checksSummary.failed} failed
                        </span>
                      )}
                      {checksSummary.pending > 0 && (
                        <span className="flex items-center gap-1">
                          <IconClock size={12} className="text-amber-600 dark:text-amber-400" />
                          {checksSummary.pending} pending
                        </span>
                      )}
                      {checksSummary.neutral > 0 && (
                        <span className="flex items-center gap-1">
                          <IconClock size={12} className="text-neutral-400" />
                          {checksSummary.neutral} other
                        </span>
                      )}
                    </div>
                  )}
                </div>
              </div>
              {!checksSummary.loading && checksSummary.total > 0 && (
                <IconChevronDown size={16} className={`shrink-0 text-neutral-500 transition-transform ${checksExpanded ? '' : 'rotate-180'}`} />
              )}
            </button>
            {checksExpanded && checksSummary.total > 0 && (
              <ul className="divide-y divide-border-light border-t border-border-light dark:divide-border-dark dark:border-border-dark">
                {checks.map((c) => {
                  const { Icon, cls } = checkConclusionStyle(c);
                  return (
                    <li key={c.id} className="flex items-center justify-between gap-3 px-3 py-2">
                      <div className="flex min-w-0 items-center gap-2.5">
                        <Icon size={14} className={`shrink-0 ${cls}`} />
                        <div className="min-w-0">
                          <div className="truncate text-xs font-medium text-neutral-900 dark:text-neutral-100">{c.name}</div>
                          {c.appName && (
                            <div className="technical-font truncate text-[10px] text-neutral-500 dark:text-neutral-400">{c.appName}</div>
                          )}
                        </div>
                      </div>
                      <div className="flex shrink-0 items-center gap-2">
                        <span className="technical-font text-[10px] uppercase text-neutral-500 dark:text-neutral-400">
                          {c.status === 'completed' ? c.conclusion || 'neutral' : c.status.replace('_', ' ')}
                        </span>
                        {c.url && (
                          <button
                            type="button"
                            onClick={() => api?.openExternal?.(c.url)}
                            aria-label={`Open details for ${c.name}`}
                            className="text-neutral-500 hover:text-neutral-900 dark:hover:text-neutral-100"
                          >
                            <IconExternal size={14} />
                          </button>
                        )}
                      </div>
                    </li>
                  );
                })}
              </ul>
            )}
          </div>
          <div className="flex flex-col gap-3 rounded-md border border-border-light bg-inset-light p-3 sm:flex-row sm:items-center sm:justify-between dark:border-border-dark dark:bg-inset-dark">
            <div className="flex items-center gap-2.5">
              {mergeable ? (
                <IconCheck size={16} className="shrink-0 text-emerald-600 dark:text-emerald-400" />
              ) : (
                <IconAlert size={16} className="shrink-0 text-amber-600 dark:text-amber-400" />
              )}
              <div>
                <div className="text-[13px] font-semibold text-neutral-900 dark:text-neutral-100">
                  {mergeable ? 'This branch has no conflicts with the base branch' : 'Merge status may vary'}
                </div>
                <div className="text-[11px] text-neutral-500 dark:text-neutral-400">Merging can be performed automatically.</div>
              </div>
            </div>
            <div className="flex shrink-0 items-center gap-2">
              {state === 'open' && (
                <>
                  <Button id="merge-github-btn" variant="secondary" onClick={() => api?.openExternal?.(data?.html_url)}>
                    <IconExternal size={13} />
                    GITHUB
                  </Button>
                  <Button variant="danger" onClick={handleClosePr} disabled={merging}>
                    CLOSE PR
                  </Button>
                  <Button id="merge-btn" variant="primary" onClick={handleMerge} disabled={!mergeable || merging}>
                    <IconGitBranch size={13} />
                    MERGE
                  </Button>
                </>
              )}
            </div>
          </div>
        </div>
        <div className="technical-font flex shrink-0 items-center justify-between border-t border-border-light px-4 py-2.5 text-[10px] dark:border-border-dark">
          <a
            id="pr-modal-link"
            href={data?.html_url}
            target="_blank"
            rel="noopener noreferrer"
            className="flex items-center gap-1 text-neutral-500 hover:text-neutral-900 dark:hover:text-neutral-100"
            onClick={(e) => {
              e.preventDefault();
              api?.openExternal?.(data?.html_url);
            }}
          >
            <IconExternal size={12} />
            OPEN IN BROWSER
          </a>
          <span id="pr-modal-meta" className="text-neutral-500 dark:text-neutral-400">Updated {data?.updated_at ?? ''}</span>
        </div>
      </div>
    </Modal>
  );
}
