import React, { useEffect, useMemo, useRef, useState } from 'react';
import Modal from '../components/ui/Modal.jsx';
import { ProviderBadge, StatusBadge } from '../components/ui/Badge.jsx';
import LoadingSpinner from '../components/ui/LoadingSpinner.jsx';
import { hasTaskContext } from '../components/task/TaskContextSection.jsx';
import UnifiedActivityFeed from '../components/task/UnifiedActivityFeed.jsx';
import FollowUpComposer from '../components/task/FollowUpComposer.jsx';
import { getProviderDisplayName, getStatusLabel, formatTimeAgo } from '../utils/format.js';
import { buildUnifiedFeed } from '../utils/agent-feed.js';
import { isNearBottom } from '../utils/transcript.js';
import { parseMarkdown } from '../utils/markdown.js';
import { useApp } from '../context/AppContext.jsx';
import DOMPurify from 'dompurify';

function MarkdownBlock({ content, className = '' }) {
  const html = useMemo(
    () => DOMPurify.sanitize(parseMarkdown(String(content ?? ''))),
    [content]
  );
  return (
    <div
      className={`prose prose-sm max-w-none text-slate-800 dark:prose-invert dark:text-slate-200 ${className}`}
      dangerouslySetInnerHTML={{ __html: html }}
    />
  );
}

const MemoizedMarkdownBlock = React.memo(MarkdownBlock);

/**
 * Chrome around the task detail. Embedded fills its parent pane; otherwise
 * the content sits in the usual modal overlay.
 *
 * Module scope on purpose: defining this during render would make it a new
 * component type each time, remounting the transcript and losing scroll.
 */
function Shell({ embedded, open, onClose, children }) {
  if (embedded) return <div className="flex h-full min-h-0 flex-col">{children}</div>;
  return (
    <Modal open={open} onClose={onClose} size="wide">
      {children}
    </Modal>
  );
}

function shortId(value) {
  const id = String(value ?? '');
  if (!id) return null;
  return id.length > 14 ? `${id.slice(0, 12)}…` : id;
}

/**
 * Pinned (never collapsed) task context: repository, branch, PR, run and
 * session metadata rendered as a compact definition grid.
 */
function PinnedTaskContext({ details, onOpenExternal, onOpenOpenCodeSession }) {
  const latestRun = details.runs?.find((run) => run.id === details.latestRunId) || details.runs?.[0];
  const projectPath = details.projectPath || details.repository;

  return (
    <section className="rounded-xl border border-slate-200 bg-slate-50/60 px-4 py-3 dark:border-border-dark dark:bg-slate-900/40">
      <h3 className="text-[10px] font-semibold uppercase tracking-wide text-slate-500">
        Context
      </h3>
      <dl className="mt-2 grid grid-cols-1 gap-x-6 gap-y-2 text-sm text-slate-800 dark:text-slate-200 sm:grid-cols-2">
        {details.repository && (
          <div className="min-w-0">
            <dt className="text-[10px] font-semibold uppercase tracking-wide text-slate-500">Repository</dt>
            <dd className="min-w-0 break-all">{details.repository}</dd>
          </div>
        )}
        {details.branch && (
          <div className="min-w-0">
            <dt className="text-[10px] font-semibold uppercase tracking-wide text-slate-500">Branch</dt>
            <dd className="min-w-0 break-all">{details.branch}</dd>
          </div>
        )}
        {details.prUrl && (
          <div className="min-w-0">
            <dt className="text-[10px] font-semibold uppercase tracking-wide text-slate-500">Pull request</dt>
            <dd className="min-w-0 break-all">
              <button
                type="button"
                onClick={() => onOpenExternal(details.prUrl)}
                className="break-all text-left text-blue-500 hover:text-blue-600 dark:text-blue-400 dark:hover:text-blue-300"
              >
                {details.prUrl}
              </button>
            </dd>
          </div>
        )}
        {details.latestRunId && (
          <div className="min-w-0">
            <dt className="text-[10px] font-semibold uppercase tracking-wide text-slate-500">Latest run</dt>
            <dd className="technical-font text-xs min-w-0 break-all">
              {details.latestRunId}
              {latestRun?.status ? ` (${latestRun.status})` : ''}
            </dd>
          </div>
        )}
        {details.opencodeSessionId && (
          <div className="min-w-0">
            <dt className="text-[10px] font-semibold uppercase tracking-wide text-slate-500">
              OpenCode session
            </dt>
            <dd className="min-w-0 break-all">
              {onOpenOpenCodeSession && projectPath ? (
                <button
                  type="button"
                  onClick={() => onOpenOpenCodeSession(details.opencodeSessionId, projectPath)}
                  className="technical-font text-xs break-all text-left text-blue-500 hover:text-blue-600 dark:text-blue-400 dark:hover:text-blue-300"
                  title="Open this session in a terminal (OpenCode TUI)"
                >
                  {details.opencodeSessionId}
                </button>
              ) : (
                <span className="technical-font text-xs break-all">{details.opencodeSessionId}</span>
              )}
            </dd>
          </div>
        )}
        {details.trackingId && (
          <div className="min-w-0">
            <dt className="text-[10px] font-semibold uppercase tracking-wide text-slate-500">
              Tracking ID
            </dt>
            <dd className="technical-font text-xs min-w-0 break-all">{details.trackingId}</dd>
          </div>
        )}
      </dl>
    </section>
  );
}

/**
 * Task detail: header, context, transcript, and follow-up composer.
 *
 * Rendered two ways - as a modal from the flat dashboard, and embedded in the
 * project view's right pane - so follow-up messaging and transcript behaviour
 * cannot drift apart between the two surfaces.
 */
export default function AgentModal({ agent, onClose, api, embedded = false }) {
  const { agentDetailsCache } = useApp();
  const [details, setDetails] = useState(null);
  const [detailsError, setDetailsError] = useState(null);
  const [loading, setLoading] = useState(!!agent);
  const [expandedRowIds, setExpandedRowIds] = useState(() => new Set());
  const scrollRootRef = useRef(null);
  const userTouchedRef = useRef(new Set());
  // Bumped after a follow-up is sent so the transcript reloads; the details
  // effect below is otherwise a one-shot fetch.
  const [refreshNonce, setRefreshNonce] = useState(0);
  // Label for the in-flight turn, shown at the end of the transcript.
  const [pendingLabel, setPendingLabel] = useState(null);
  // Jump-to-bottom affordance: hidden while already at the end.
  const [showJumpToBottom, setShowJumpToBottom] = useState(false);
  const didAutoScrollRef = useRef(false);

  // Stable across renders: an inline arrow here would be a new prop identity
  // every time, defeating React.memo on every markdown block below it.
  const renderMarkdown = React.useCallback(
    (content) => <MemoizedMarkdownBlock content={content} />,
    []
  );

  const scrollToBottom = React.useCallback((behavior = 'smooth') => {
    const root = scrollRootRef.current;
    if (!root) return;
    root.scrollTo({ top: root.scrollHeight, behavior });
  }, []);

  // Track scroll position so the button only appears when it would do something.
  useEffect(() => {
    const root = scrollRootRef.current;
    if (!root) return undefined;

    // A large transcript is thousands of nodes; re-rendering it on every
    // scroll event is what made scrolling feel laggy. Coalesce to one check
    // per frame, and only touch state when the answer actually changes.
    let frame = null;
    const update = () => {
      frame = null;
      const next = !isNearBottom(root);
      setShowJumpToBottom((prev) => (prev === next ? prev : next));
    };
    const schedule = () => {
      if (frame !== null) return;
      frame = requestAnimationFrame(update);
    };

    update();
    root.addEventListener('scroll', schedule, { passive: true });

    // Content grows as details load and images decode; re-evaluate on resize.
    const observer =
      typeof ResizeObserver !== 'undefined' ? new ResizeObserver(schedule) : null;
    observer?.observe(root);

    return () => {
      if (frame !== null) cancelAnimationFrame(frame);
      root.removeEventListener('scroll', schedule);
      observer?.disconnect();
    };
  }, [details, pendingLabel]);

  // A conversation is most useful at its newest message, so open there once
  // the transcript has loaded. Only on first load per task - re-running would
  // yank the view out from under someone reading history.
  //
  // The jump must be instant, not animated: scrolling through a long
  // transcript is slow and disorienting. It also has to survive late layout -
  // markdown blocks and images change scrollHeight after the first frame - so
  // re-pin until the height stops growing.
  useEffect(() => {
    if (!details || didAutoScrollRef.current) return;
    didAutoScrollRef.current = true;

    let frame = null;
    let settled = 0;
    let lastHeight = -1;

    const pin = () => {
      const root = scrollRootRef.current;
      if (!root) return;
      root.scrollTop = root.scrollHeight;

      // Two consecutive stable heights means layout has finished.
      if (root.scrollHeight === lastHeight) settled += 1;
      else settled = 0;
      lastHeight = root.scrollHeight;

      if (settled < 2) frame = requestAnimationFrame(pin);
    };

    frame = requestAnimationFrame(pin);
    return () => {
      if (frame !== null) cancelAnimationFrame(frame);
    };
  }, [details]);

  const sessionId =
    agent?.provider === 'jules'
      ? String(agent.rawId || agent.id || '').replace(/^jules-/, '')
      : null;

  useEffect(() => {
    if (!agent) return;

    setLoading(true);
    setDetails(null);
    setDetailsError(null);
    setExpandedRowIds(new Set());
    setPendingLabel(null);
    setShowJumpToBottom(false);
    didAutoScrollRef.current = false;
    userTouchedRef.current = new Set();

    const isJules = agent.provider === 'jules';
    const rawId = agent.rawId || agent.id;
    const julesSessionId = isJules ? String(rawId || '').replace(/^jules-/, '') : null;

    // Seed from the background pre-fetch cache so the modal renders instantly;
    // the live fetch below still runs to refresh.
    const cached = agentDetailsCache?.get(agent.provider, rawId);
    if (cached) {
      setDetails(cached);
      setLoading(false);
    }

    if (isJules && api?.getJulesAgentDetailsText && julesSessionId) {
      api
        .getJulesAgentDetailsText(julesSessionId)
        .then((result) => {
          setDetails(result?.details ?? result);
        })
        .catch((err) => {
          console.error(err);
          setDetailsError(err?.message || 'Failed to load agent details');
        })
        .finally(() => setLoading(false));
      return;
    }

    if (!api?.getAgentDetails) {
      setLoading(false);
      return;
    }

    api
      .getAgentDetails(agent.provider, rawId, agent.filePath)
      .then((result) => {
        setDetails(result?.details ?? result);
      })
      .catch((err) => {
        console.error(err);
        setDetailsError(err?.message || 'Failed to load agent details');
      })
      .finally(() => setLoading(false));
  }, [agent?.provider, agent?.rawId, agent?.id, agent?.filePath, api, refreshNonce]);

  useEffect(() => {
    if (agent?.status !== 'running' || !details?.activities?.length) return;
    const latestId = details.activities[0]?.id;
    if (latestId == null || userTouchedRef.current.has(`row:${latestId}`)) return;
    setExpandedRowIds((prev) => {
      if (prev.has(latestId)) return prev;
      const next = new Set(prev);
      next.add(latestId);
      return next;
    });
  }, [details, agent?.status]);

  if (!agent) return null;

  const providerName = getProviderDisplayName(agent.provider);
  const statusLabel = getStatusLabel(agent.status);

  const openCodeSessionId =
    details?.opencodeSessionId || agent.opencodeSessionId || null;
  const openCodeProjectPath =
    details?.projectPath || details?.repository || agent.repository || null;

  const handleOpenOpenCodeSession = async () => {
    if (!api?.openOpenCodeSession || !openCodeSessionId || !openCodeProjectPath) return;
    try {
      const result = await api.openOpenCodeSession(openCodeSessionId, openCodeProjectPath);
      if (result?.success === false) {
        setDetailsError(result.error || 'Failed to open OpenCode session in terminal');
      }
    } catch (err) {
      setDetailsError(err?.message || 'Failed to open OpenCode session in terminal');
    }
  };

  const handleRowToggle = (rowId, next) => {
    userTouchedRef.current.add(`row:${rowId}`);
    setExpandedRowIds((prev) => {
      const nextSet = new Set(prev);
      if (next) nextSet.add(rowId);
      else nextSet.delete(rowId);
      return nextSet;
    });
  };

  const fullTitle = details?.name ?? agent.name ?? 'Agent Details';
  const canOpenTerminal =
    agent.provider === 'opencode' &&
    !!openCodeSessionId &&
    !!openCodeProjectPath &&
    !!handleOpenOpenCodeSession;
  const terminalButton = canOpenTerminal ? (
    <button
      type="button"
      onClick={handleOpenOpenCodeSession}
      className="flex items-center gap-1 text-xs text-blue-500 hover:text-blue-600 dark:text-blue-400 dark:hover:text-blue-300"
    >
      <span className="material-symbols-outlined text-[14px]">terminal</span>
      Open in terminal
    </button>
  ) : null;

  const webUrl = details?.webUrl || agent.webUrl;
  const updatedLabel = formatTimeAgo(details?.updatedAt || agent.updatedAt);
  const taskIdLabel = shortId(agent.rawId || agent.id);
  const metaParts = [updatedLabel, taskIdLabel].filter(Boolean);

  return (
    <Shell embedded={embedded} open={!!agent} onClose={onClose}>
      <div
        id="agent-modal"
        className={
          embedded
            ? 'flex h-full min-h-0 flex-col overflow-hidden rounded-lg border border-slate-200 bg-white dark:border-border-dark dark:bg-sidebar-dark'
            : 'flex h-[90vh] min-h-0 flex-col overflow-hidden rounded-2xl border border-slate-200 bg-white shadow-2xl dark:border-border-dark dark:bg-sidebar-dark'
        }
      >
        <div className="sticky top-0 z-10 flex flex-wrap items-center gap-x-3 gap-y-2 border-b border-slate-200 bg-white/95 px-5 py-3 backdrop-blur dark:border-border-dark dark:bg-black/70 lg:px-6">
          <ProviderBadge provider={agent.provider}>{providerName}</ProviderBadge>
          <span id="modal-status-badge" className="inline-flex items-center gap-1.5">
            {agent.status === 'running' && (
              <span
                aria-hidden="true"
                className="h-1.5 w-1.5 animate-pulse rounded-full bg-yellow-400"
              />
            )}
            <StatusBadge status={agent.status}>{statusLabel}</StatusBadge>
          </span>
          <h2
            id="modal-title"
            title={fullTitle}
            className="min-w-0 flex-1 truncate font-display text-sm font-semibold text-slate-900 dark:text-white"
          >
            {fullTitle}
          </h2>
          <div className="flex shrink-0 items-center gap-3">
            {metaParts.length > 0 && (
              <span className="hidden text-[10px] technical-font text-slate-500 sm:inline">
                {metaParts.join(' · ')}
              </span>
            )}
            {webUrl && (
              <button
                onClick={() => api.openExternal(webUrl)}
                className="flex items-center gap-1 text-xs text-blue-500 transition-colors hover:text-blue-600 dark:text-blue-400 dark:hover:text-blue-300"
                title="Open task in browser"
              >
                <span className="material-symbols-outlined text-[14px]">open_in_new</span>
                Go To Task
              </button>
            )}
            {terminalButton}
            {!embedded && (
            <button
              type="button"
              onClick={onClose}
              className="text-slate-500 transition-colors hover:text-slate-700 dark:hover:text-primary"
            >
              <span className="material-symbols-outlined">close</span>
            </button>
            )}
          </div>
        </div>
        <div className="relative min-h-0 flex-1">
        <div
          id="modal-content"
          ref={scrollRootRef}
          className="h-full overflow-y-auto px-6 py-5 lg:px-8 bg-white dark:bg-background-dark"
        >
          {loading && <LoadingSpinner />}
          {!loading && details && (() => {
            const hasContent = typeof details.content === 'string' && details.content.trim().length > 0;
            if (hasContent) {
              return (
                <div
                  className="markdown-content prose prose-sm max-w-none dark:prose-invert"
                  dangerouslySetInnerHTML={{ __html: DOMPurify.sanitize(details.content) }}
                />
              );
            }
            const feed = buildUnifiedFeed(details);
            const hasContext = hasTaskContext(details);
            const hasSummary = !!(details.summary && String(details.summary).trim());
            const promptFallback =
              feed.length === 0 && details.prompt && String(details.prompt).trim();
            if (!hasContext && !hasSummary && feed.length === 0 && !promptFallback) {
              return <p className="text-slate-500">No details available.</p>;
            }
            return (
              <div className="max-w-none space-y-6">
                {hasContext && (
                  <PinnedTaskContext
                    details={details}
                    onOpenExternal={(url) => api.openExternal(url)}
                    onOpenOpenCodeSession={
                      agent.provider === 'opencode' && api?.openOpenCodeSession
                        ? (id, projectPath) => api.openOpenCodeSession(id, projectPath)
                        : null
                    }
                  />
                )}
                {hasSummary && (
                  <section>
                    <h3 className="text-[10px] font-semibold uppercase tracking-wide text-slate-500">
                      Summary
                    </h3>
                    <p className="mt-2 whitespace-pre-wrap text-sm text-slate-800 dark:text-slate-200">
                      {details.summary}
                    </p>
                  </section>
                )}
                {feed.length > 0 && (
                  <>
                    <UnifiedActivityFeed
                      feed={feed}
                      renderMessage={renderMarkdown}
                      assistantLabel={providerName}
                      showMedia={agent.provider === 'jules'}
                      mediaApi={api}
                      mediaSessionId={sessionId}
                      scrollRootRef={scrollRootRef}
                      expandedIds={expandedRowIds}
                      onToggleRow={handleRowToggle}
                      pending={pendingLabel}
                    />
                    <FollowUpComposer
                      agent={agent}
                      api={api}
                      onPendingChange={setPendingLabel}
                      onSent={() => setRefreshNonce((n) => n + 1)}
                    />
                  </>
                )}
                {promptFallback && <MemoizedMarkdownBlock content={details.prompt} />}
              </div>
            );
          })()}
          {!loading && detailsError && (
            <p className="text-sm text-red-600 dark:text-red-400">Could not load details: {detailsError}</p>
          )}
          {!loading && !details && !detailsError && (
            <p className="text-slate-500">No details available.</p>
          )}
        </div>
        {showJumpToBottom && (
          <button
            type="button"
            onClick={() => scrollToBottom()}
            title="Jump to latest"
            aria-label="Jump to latest message"
            className="absolute bottom-4 right-6 flex items-center gap-1.5 rounded-full border border-slate-200 bg-white/95 px-3 py-2 text-xs font-medium text-slate-700 shadow-lg backdrop-blur transition-all hover:border-primary hover:text-primary dark:border-border-dark dark:bg-card-dark/95 dark:text-slate-200 dark:hover:text-primary"
          >
            <span className="material-symbols-outlined text-[16px]">arrow_downward</span>
            Latest
          </button>
        )}
        </div>
        <div className="shrink-0 border-t border-slate-200 bg-slate-50 px-6 py-3 dark:border-border-dark dark:bg-black flex flex-col items-end gap-1 text-[10px] technical-font text-slate-600">
          {agent.provider === 'opencode' ? (
            <>
              <span id="modal-task-id" className="break-all">Tracking ID: {agent.rawId || agent.id || '--'}</span>
              {openCodeSessionId ? (
                <button
                  type="button"
                  id="modal-opencode-session-id"
                  onClick={handleOpenOpenCodeSession}
                  disabled={!openCodeProjectPath || !api?.openOpenCodeSession}
                  className="text-blue-500 hover:text-blue-600 dark:text-blue-400 dark:hover:text-blue-300 disabled:opacity-50 disabled:cursor-not-allowed text-left break-all"
                  title={
                    openCodeProjectPath
                      ? 'Open OpenCode TUI for this session'
                      : 'Project path unavailable'
                  }
                >
                  OpenCode session: {openCodeSessionId}
                </button>
              ) : (
                <span className="text-slate-500">OpenCode session: not linked (legacy or failed run)</span>
              )}
            </>
          ) : (
            <span id="modal-task-id" className="break-all">Task ID: {agent.rawId || agent.id || '--'}</span>
          )}
        </div>
      </div>
    </Shell>
  );
}
