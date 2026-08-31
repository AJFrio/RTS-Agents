import React, { useEffect, useMemo, useRef, useState } from 'react';
import Modal from '../components/ui/Modal.jsx';
import { ProviderBadge, StatusBadge } from '../components/ui/Badge.jsx';
import LoadingSpinner from '../components/ui/LoadingSpinner.jsx';
import ChatTranscript from '../components/ui/ChatTranscript.jsx';
import SectionHeader from '../components/ui/SectionHeader.jsx';
import TaskContextSection, { hasTaskContext } from '../components/task/TaskContextSection.jsx';
import ActivityTimeline from '../components/task/ActivityTimeline.jsx';
import ConversationList from '../components/task/ConversationList.jsx';
import FollowUpComposer from '../components/task/FollowUpComposer.jsx';
import { getProviderDisplayName, getStatusLabel } from '../utils/format.js';
import { isNearBottom } from '../utils/transcript.js';
import { parseMarkdown } from '../utils/markdown.js';
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

/**
 * Task detail: header, context, transcript, and follow-up composer.
 *
 * Rendered two ways. As a modal from the flat dashboard, and embedded in the
 * project view's right pane. Both share this one implementation so follow-up
 * messaging and transcript behaviour cannot drift apart.
 */
export default function AgentModal({ agent, onClose, api, embedded = false }) {
  const [details, setDetails] = useState(null);
  const [detailsError, setDetailsError] = useState(null);
  const [loading, setLoading] = useState(!!agent);
  const [activityOpen, setActivityOpen] = useState(true);
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

  // Same reasoning as renderMarkdown; the activity variant carries its own
  // indent styling.
  const renderActivityMarkdown = React.useCallback(
    (content) => (
      <MemoizedMarkdownBlock
        content={content}
        className="mt-2 border-l-2 border-slate-100 pl-3 text-slate-700 dark:border-slate-700 dark:text-slate-300"
      />
    ),
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
  // transcript is both slow and disorienting. It also has to survive late
  // layout - markdown blocks and images change scrollHeight after the first
  // frame - so re-pin until the height stops growing.
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
    setActivityOpen(true);
    setExpandedRowIds(new Set());
    setPendingLabel(null);
    setShowJumpToBottom(false);
    didAutoScrollRef.current = false;
    userTouchedRef.current = new Set();

    const isJules = agent.provider === 'jules';
    const rawId = agent.rawId || agent.id;
    const julesSessionId = isJules ? String(rawId || '').replace(/^jules-/, '') : null;

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
    if (!details) return;
    if (userTouchedRef.current.has('section:activity')) return;
    const count = details.activities?.length ?? 0;
    setActivityOpen(!(count > 8 && agent?.status !== 'running'));
  }, [details, agent?.status]);

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

  const handleActivityToggle = (next) => {
    userTouchedRef.current.add('section:activity');
    setActivityOpen(next);
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
      className="text-xs text-blue-500 hover:text-blue-600 dark:text-blue-400 dark:hover:text-blue-300 flex items-center gap-1"
    >
      <span className="material-symbols-outlined text-[14px]">terminal</span>
      Open in terminal
    </button>
  ) : null;

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
        <div className="flex items-start justify-between gap-4 border-b border-slate-200 bg-white px-6 py-4 dark:border-border-dark dark:bg-black/40">
          <div className="min-w-0 flex-1">
            <div className="flex items-center gap-3 mb-2">
              <ProviderBadge provider={agent.provider}>{providerName}</ProviderBadge>
              <span id="modal-status-badge">
                <StatusBadge status={agent.status}>{statusLabel}</StatusBadge>
              </span>
              {(details?.webUrl || agent.webUrl) && (
                <button
                  onClick={() => api.openExternal(details?.webUrl || agent.webUrl)}
                  className="text-xs text-blue-500 hover:text-blue-600 dark:text-blue-400 dark:hover:text-blue-300 flex items-center gap-1 ml-2 transition-colors"
                  title="Open task in browser"
                >
                  <span className="material-symbols-outlined text-[14px]">open_in_new</span>
                  Go To Task
                </button>
              )}
            </div>
            <h2
              id="modal-title"
              title={fullTitle}
              className="text-xl font-display font-bold text-slate-900 dark:text-white truncate"
            >
              {fullTitle}
            </h2>
            <div className="mt-1 text-[10px] technical-font text-slate-500">Task overview and activity</div>
          </div>
          {!embedded && (
            <button
              type="button"
              onClick={onClose}
              className="text-slate-500 hover:text-slate-700 dark:hover:text-primary transition-colors"
            >
              <span className="material-symbols-outlined">close</span>
            </button>
          )}
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
                  className="markdown-content prose dark:prose-invert prose-sm max-w-none"
                  dangerouslySetInnerHTML={{ __html: DOMPurify.sanitize(details.content) }}
                />
              );
            }
            const hasPrompt = details.prompt && String(details.prompt).trim();
            const hasSummary = details.summary && String(details.summary).trim();
            const hasActivities = details.activities?.length > 0;
            const hasConversation = details.conversation?.length > 0;
            const hasMessages = details.messages?.length > 0;
            const hasContext = hasTaskContext(details);
            if (
              !hasPrompt &&
              !hasSummary &&
              !hasActivities &&
              !hasConversation &&
              !hasMessages &&
              !hasContext
            ) {
              return <p className="text-slate-500">No details available.</p>;
            }
            return (
              <div className="max-w-none space-y-6">
                {hasContext && (
                  <TaskContextSection
                    details={details}
                    onOpenExternal={(url) => api.openExternal(url)}
                    onOpenOpenCodeSession={
                      agent.provider === 'opencode' && api?.openOpenCodeSession
                        ? (id, projectPath) => api.openOpenCodeSession(id, projectPath)
                        : null
                    }
                  />
                )}
                {hasPrompt && (
                  <SectionHeader label="Prompt" icon="description" defaultOpen>
                    <MemoizedMarkdownBlock content={details.prompt} />
                  </SectionHeader>
                )}
                {hasSummary && (
                  <SectionHeader label="Summary" icon="notes" defaultOpen>
                    <p className="text-sm text-slate-800 dark:text-slate-200 whitespace-pre-wrap">
                      {details.summary}
                    </p>
                  </SectionHeader>
                )}
                {hasActivities && (
                  <SectionHeader
                    label="Activity"
                    icon="timeline"
                    count={details.activities.length}
                    open={activityOpen}
                    onToggle={handleActivityToggle}
                  >
                    <ActivityTimeline
                      activities={details.activities}
                      renderMessage={renderActivityMarkdown}
                      showMedia={agent.provider === 'jules'}
                      mediaApi={api}
                      mediaSessionId={sessionId}
                      scrollRootRef={scrollRootRef}
                      expandedIds={expandedRowIds}
                      onToggleRow={handleRowToggle}
                    />
                  </SectionHeader>
                )}
                {hasConversation && (
                  <SectionHeader label="Conversation" icon="forum" defaultOpen>
                    <ConversationList
                      conversation={details.conversation}
                      renderMessage={renderMarkdown}
                    />
                  </SectionHeader>
                )}
                {hasMessages && (
                  <SectionHeader
                    label="Messages"
                    icon="chat"
                    defaultOpen
                    headerAction={terminalButton}
                  >
                    <ChatTranscript
                      messages={details.messages}
                      assistantLabel={getProviderDisplayName(agent.provider)}
                      renderContent={renderMarkdown}
                      pending={pendingLabel}
                    />
                    <FollowUpComposer
                      agent={agent}
                      api={api}
                      onPendingChange={setPendingLabel}
                      onSent={() => setRefreshNonce((n) => n + 1)}
                    />
                  </SectionHeader>
                )}
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
