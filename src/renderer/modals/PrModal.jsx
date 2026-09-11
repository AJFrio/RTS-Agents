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
  IconArrowRight,
  IconClock as IconUpdatedAt,
} from '../components/ui/icons.jsx';
import { useApp } from '../context/AppContext.jsx';
import { parseMarkdown } from '../utils/markdown.js';
import { relativeTime } from '../utils/format.js';
import DOMPurify from 'dompurify';

export default function PrModal({ pr, onClose, api }) {
  const { loadAgents, removePr } = useApp();
  const [details, setDetails] = useState(null);
  const [merging, setMerging] = useState(false);
  const [checks, setChecks] = useState(null);
  const [checksExpanded, setChecksExpanded] = useState(false);

  const owner = pr?.base?.repo?.owner?.login || pr?.head?.repo?.owner?.login;
  const repoName = pr?.base?.repo?.name || pr?.head?.repo?.name;
  const repoFullName = pr?.base?.repo?.full_name || pr?.repository?.full_name;
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
    if (!Array.isArray(checks))
      return { loading: true, total: 0, passed: 0, failed: 0, pending: 0, neutral: 0 };
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
      else if (
        c.conclusion === 'failure' ||
        c.conclusion === 'timed_out' ||
        c.conclusion === 'action_required'
      )
        failed += 1;
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
    if (c.status !== 'completed')
      return { Icon: IconClock, cls: 'text-amber-600 dark:text-amber-400' };
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

  const bodyHtml = DOMPurify.sanitize(parseMarkdown(data?.body || ''));

  return (
    <Modal open={!!pr} onClose={onClose} size="lg">
      <div id="pr-modal" className="flex max-h-[90vh] w-full flex-col">
        <div className="flex shrink-0 items-start justify-between gap-3 border-b border-border-light px-5 py-4 dark:border-border-dark">
          <div className="min-w-0 flex-1">
            <div className="flex flex-wrap items-center gap-2">
              <span
                id="pr-modal-state"
                className={`inline-flex items-center gap-1.5 rounded-full px-2 py-0.5 text-[10px] font-semibold uppercase tracking-wider ${
                  state === 'open'
                    ? 'bg-emerald-500/10 text-emerald-700 dark:text-emerald-400'
                    : 'bg-neutral-400/10 text-neutral-500 dark:text-neutral-400'
                }`}
              >
                {state === 'open' ? <IconGitBranch size={10} /> : <IconCheck size={10} />}
                {state}
              </span>
              {repoFullName && (
                <span className="truncate font-mono text-[11px] text-neutral-500 dark:text-neutral-400">
                  {repoFullName}
                </span>
              )}
              <span
                id="pr-modal-number"
                className="font-mono text-[11px] text-neutral-400 dark:text-neutral-500"
              >
                #{pr.number}
              </span>
            </div>
            <h2
              id="pr-modal-title"
              className="mt-1.5 text-[16px] font-semibold leading-snug text-neutral-900 dark:text-neutral-100"
            >
              {data?.title || 'Loading...'}
            </h2>
            {data?.user?.login && (
              <p className="mt-1 text-xs text-neutral-500 dark:text-neutral-400">
                {data.user.login} · wants to merge{' '}
                <span className="font-mono">{data?.head?.ref ?? '—'}</span> into{' '}
                <span className="font-mono">{data?.base?.ref ?? '—'}</span>
              </p>
            )}
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

        <div className="flex-1 overflow-y-auto px-5 py-4">
          <div className="grid grid-cols-1 gap-2 sm:grid-cols-2">
            <div className="flex items-center gap-2.5 rounded-md border border-border-light bg-inset-light px-3 py-2 dark:border-border-dark dark:bg-inset-dark">
              <IconGitBranch size={14} className="shrink-0 text-neutral-400" />
              <div className="min-w-0">
                <div className="text-[10px] font-semibold uppercase tracking-wider text-neutral-500 dark:text-neutral-400">
                  Source
                </div>
                <div
                  id="pr-modal-head"
                  className="truncate font-mono text-xs text-neutral-900 dark:text-neutral-100"
                >
                  {data?.head?.ref ?? '—'}
                </div>
              </div>
            </div>
            <div className="flex items-center gap-2.5 rounded-md border border-border-light bg-inset-light px-3 py-2 dark:border-border-dark dark:bg-inset-dark">
              <IconArrowRight size={14} className="shrink-0 text-neutral-400" />
              <div className="min-w-0">
                <div className="text-[10px] font-semibold uppercase tracking-wider text-neutral-500 dark:text-neutral-400">
                  Target
                </div>
                <div
                  id="pr-modal-base"
                  className="truncate font-mono text-xs text-neutral-600 dark:text-neutral-300"
                >
                  {data?.base?.ref ?? '—'}
                </div>
              </div>
            </div>
          </div>

          <div className="mt-5">
            <h3 className="mb-2 text-[10px] font-semibold uppercase tracking-wider text-neutral-500 dark:text-neutral-400">
              Description
            </h3>
            <div
              id="pr-modal-body"
              className="max-w-none text-[13px] leading-relaxed text-neutral-600 dark:text-neutral-300 [&_a]:underline [&_a]:text-neutral-900 [&_a]:dark:text-neutral-100 [&_blockquote]:border-l-2 [&_blockquote]:border-border-strong-light [&_blockquote]:pl-3 [&_blockquote]:text-neutral-500 [&_blockquote]:dark:border-border-strong-dark [&_blockquote]:dark:text-neutral-400 [&_code]:rounded [&_code]:bg-inset-light [&_code]:px-1 [&_code]:py-0.5 [&_code]:font-mono [&_code]:text-[12px] [&_code]:dark:bg-inset-dark [&_h1]:text-[15px] [&_h1]:font-semibold [&_h2]:text-[14px] [&_h2]:font-semibold [&_h3]:text-[13px] [&_h3]:font-semibold [&_h1]:dark:text-neutral-100 [&_h2]:dark:text-neutral-100 [&_h3]:dark:text-neutral-100 [&_img]:my-2 [&_img]:max-w-full [&_li]:ml-4 [&_li]:list-disc [&_ol>li]:ml-4 [&_ol>li]:list-decimal [&_p]:my-2 [&_pre]:overflow-x-auto [&_pre]:rounded-md [&_pre]:bg-inset-light [&_pre]:p-2 [&_pre]:font-mono [&_pre]:text-[12px] [&_pre]:dark:bg-inset-dark [&_strong]:font-semibold [&_strong]:text-neutral-900 [&_strong]:dark:text-neutral-100"
              dangerouslySetInnerHTML={{ __html: bodyHtml }}
            />
          </div>

          <div
            id="pr-modal-checks"
            className="mt-5 overflow-hidden rounded-md border border-border-light dark:border-border-dark"
          >
            <button
              type="button"
              onClick={() => setChecksExpanded((v) => !v)}
              disabled={!checksSummary.loading && checksSummary.total === 0}
              className="flex w-full items-center justify-between gap-3 bg-inset-light px-3 py-2.5 text-left transition-colors hover:bg-neutral-100 disabled:cursor-default dark:bg-inset-dark dark:hover:bg-neutral-800/60"
            >
              <div className="flex min-w-0 items-center gap-2.5">
                {(() => {
                  const { Icon, cls } = checksIcon;
                  return <Icon size={16} className={`shrink-0 ${cls}`} />;
                })()}
                <div className="min-w-0">
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
                <IconChevronDown
                  size={16}
                  className={`shrink-0 text-neutral-500 transition-transform ${checksExpanded ? '' : 'rotate-180'}`}
                />
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
                          <div className="truncate text-xs font-medium text-neutral-900 dark:text-neutral-100">
                            {c.name}
                          </div>
                          {c.appName && (
                            <div className="truncate font-mono text-[10px] text-neutral-500 dark:text-neutral-400">
                              {c.appName}
                            </div>
                          )}
                        </div>
                      </div>
                      <div className="flex shrink-0 items-center gap-2">
                        <span className="font-mono text-[10px] uppercase text-neutral-500 dark:text-neutral-400">
                          {c.status === 'completed'
                            ? c.conclusion || 'neutral'
                            : c.status.replace('_', ' ')}
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

          <div className="mt-5 flex flex-col gap-3 rounded-md border border-border-light bg-inset-light p-3 sm:flex-row sm:items-center sm:justify-between dark:border-border-dark dark:bg-inset-dark">
            <div className="flex items-center gap-2.5">
              {mergeable ? (
                <IconCheck size={16} className="shrink-0 text-emerald-600 dark:text-emerald-400" />
              ) : (
                <IconAlert size={16} className="shrink-0 text-amber-600 dark:text-amber-400" />
              )}
              <div>
                <div className="text-[13px] font-semibold text-neutral-900 dark:text-neutral-100">
                  {mergeable
                    ? 'No conflicts with the base branch'
                    : 'This branch has conflicts that must be resolved'}
                </div>
                <div className="text-[11px] text-neutral-500 dark:text-neutral-400">
                  {mergeable
                    ? 'Merging can be performed automatically.'
                    : 'Resolve the conflicts on GitHub before merging.'}
                </div>
              </div>
            </div>
            <div className="flex shrink-0 flex-wrap items-center gap-2">
              {state === 'open' && (
                <>
                  <Button
                    id="merge-github-btn"
                    variant="secondary"
                    onClick={() => api?.openExternal?.(data?.html_url)}
                  >
                    <IconExternal size={13} />
                    GitHub
                  </Button>
                  <Button variant="danger" onClick={handleClosePr} disabled={merging}>
                    Close PR
                  </Button>
                  <Button
                    id="merge-btn"
                    variant="primary"
                    onClick={handleMerge}
                    disabled={!mergeable || merging}
                  >
                    <IconGitBranch size={13} />
                    {merging ? 'Merging…' : 'Merge'}
                  </Button>
                </>
              )}
            </div>
          </div>
        </div>

        <div className="flex shrink-0 items-center justify-between gap-3 border-t border-border-light px-5 py-3 text-[11px] dark:border-border-dark">
          <a
            id="pr-modal-link"
            href={data?.html_url}
            target="_blank"
            rel="noopener noreferrer"
            className="flex items-center gap-1.5 text-neutral-500 transition-colors hover:text-neutral-900 dark:hover:text-neutral-100"
            onClick={(e) => {
              e.preventDefault();
              api?.openExternal?.(data?.html_url);
            }}
          >
            <IconExternal size={12} />
            Open in browser
          </a>
          <span
            id="pr-modal-meta"
            className="flex items-center gap-1.5 text-neutral-500 dark:text-neutral-400"
          >
            <IconUpdatedAt size={11} className="shrink-0" />
            Updated {relativeTime(data?.updated_at)}
          </span>
        </div>
      </div>
    </Modal>
  );
}
