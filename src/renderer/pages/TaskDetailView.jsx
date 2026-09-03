import React, { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { toast } from 'sonner';
import { useApp } from '../context/AppContext.jsx';
import { fetchAgentDetails } from '../context/helpers/agent-details-cache.js';
import { detailsToTranscript, hasTranscriptContent } from '../utils/task-transcript.js';
import ChatTranscript from '../components/ui/ChatTranscript.jsx';
import MarkdownText from '../components/ui/Markdown.jsx';
import Composer from '../components/chat/Composer.jsx';
import JulesActivityMedia from '../components/task/JulesActivityMedia.jsx';
import TaskContextSection, { hasTaskContext } from '../components/task/TaskContextSection.jsx';
import { providerMeta, IconExternal, IconTerminal, IconClose, IconSync } from '../components/ui/icons.jsx';
import { StatusDot, statusMeta } from '../components/ui/status.jsx';

const FOLLOWUP_PROVIDERS = new Set([
  'jules',
  'cursor',
  'claude-cloud',
  'claude-cli',
  'claude',
  'codex',
  'opencode',
  'antigravity',
]);
const CLOUD_POLL_MS = 8000;
const CLOUD_DETAIL_POLL_PROVIDERS = new Set(['jules', 'cursor', 'claude-cloud']);
const SESSION_UPDATE_DEBOUNCE_MS = 100;

/**
 * Task chat log on the canvas (DESIGN.md §2.3): same ChatTranscript as the
 * Agent tab. User turns are right-aligned; harness thinking and tool calls
 * collapse and expand in place. A follow-up composer sits at the bottom for
 * harnesses that support it.
 */
export default function TaskDetailView() {
  const { state, api, closeTask, agentDetailsCache } = useApp();
  const task = state.selectedTask;
  const [details, setDetails] = useState(null);
  const [loading, setLoading] = useState(true);
  const [followUp, setFollowUp] = useState('');
  const [sending, setSending] = useState(false);
  const [pendingFollowUps, setPendingFollowUps] = useState([]);
  const scrollRef = useRef(null);
  const sessionUpdateTimer = useRef(null);
  const pendingSessionUpdate = useRef(null);
  const liveAgent = useMemo(() => {
    if (!task) return null;
    return (
      (state.agents || []).find(
        (agent) =>
          agent.id === task.id ||
          agent.rawId === task.rawId ||
          agent.id === task.rawId ||
          agent.rawId === task.id
      ) || null
    );
  }, [state.agents, task]);
  const liveStatus = details?.status ?? liveAgent?.status ?? task?.status;
  const meta = providerMeta(task?.provider);
  const status = statusMeta(liveStatus);

  const rawId = task?.rawId || task?.id;
  const julesSessionId =
    task?.provider === 'jules' ? String(rawId || '').replace(/^jules-/, '') : '';

  const loadDetails = useCallback(
    async (opts = {}) => {
      if (!task || !api) return;
      if (!opts.silent) setLoading(true);
      try {
        const fetched = await fetchAgentDetails(api, task);
        if (fetched) setDetails(fetched);
      } catch (err) {
        if (!opts.silent) toast.error(err?.message || 'Failed to load task details');
      } finally {
        if (!opts.silent) setLoading(false);
      }
    },
    [api, task]
  );

  useEffect(() => {
    setPendingFollowUps([]);
    setFollowUp('');
    if (task && agentDetailsCache) {
      const cached = agentDetailsCache.get(task.provider, task.rawId || task.id);
      if (cached) {
        setDetails(cached);
        setLoading(false);
      } else {
        setDetails(null);
      }
    }
    loadDetails();
  }, [task?.provider, task?.rawId, loadDetails, agentDetailsCache]);

  useEffect(() => {
    if (!task || liveStatus !== 'running') return undefined;
    if (!CLOUD_DETAIL_POLL_PROVIDERS.has(task.provider)) return undefined;
    const interval = setInterval(() => loadDetails({ silent: true }), CLOUD_POLL_MS);
    return () => clearInterval(interval);
  }, [task, liveStatus, loadDetails]);

  useEffect(() => {
    if (!api?.onSessionUpdated || !task) return undefined;
    const taskId = task.rawId || task.id;
    const unsub = api.onSessionUpdated((payload) => {
      if (!payload) return;
      if (payload.id !== taskId && payload.rawId !== taskId) return;
      pendingSessionUpdate.current = payload;
      if (sessionUpdateTimer.current) return;
      sessionUpdateTimer.current = setTimeout(() => {
        sessionUpdateTimer.current = null;
        const next = pendingSessionUpdate.current;
        pendingSessionUpdate.current = null;
        if (next?.details) {
          setDetails((prev) => ({ ...(prev || {}), ...next.details }));
        }
      }, SESSION_UPDATE_DEBOUNCE_MS);
    });
    return () => {
      unsub();
      if (sessionUpdateTimer.current) {
        clearTimeout(sessionUpdateTimer.current);
        sessionUpdateTimer.current = null;
      }
    };
  }, [api, task?.id, task?.rawId]);

  useEffect(() => {
    const el = scrollRef.current;
    if (el) el.scrollTop = el.scrollHeight;
  }, [details, pendingFollowUps]);

  const messages = useMemo(() => detailsToTranscript(details, task), [details, task]);
  const hasTranscript = hasTranscriptContent(messages);
  const supportsFollowUp =
    FOLLOWUP_PROVIDERS.has(task?.provider) && details?.canFollowUp !== false;
  const isWorking = liveStatus === 'running' || sending;
  const renderContent = useCallback((content) => <MarkdownText text={content} />, []);

  const handleFollowUp = async () => {
    const text = followUp.trim();
    if (!text || !task || sending) return;
    setSending(true);
    setPendingFollowUps((prev) => [...prev, { id: `pending-${Date.now()}`, text }]);
    setFollowUp('');
    try {
      const result = await api.sendMessage(task.provider, rawId, text);
      if (result?.success === false) {
        throw new Error(result.error || 'Failed to send follow-up');
      }
      await loadDetails({ silent: true });
      setPendingFollowUps((prev) => prev.filter((m) => m.text !== text));
    } catch (err) {
      setPendingFollowUps((prev) => prev.filter((m) => m.text !== text));
      toast.error(err?.message || 'Failed to send follow-up');
    } finally {
      setSending(false);
    }
  };

  const renderCards = useCallback(
    (cards) => (
      <div className="space-y-2">
        {cards.map((card) =>
          card.kind === 'jules-media' ? (
            <JulesActivityMedia
              key={card.id}
              sessionId={julesSessionId}
              activity={{ id: card.activityId || card.id, hasMedia: true }}
              api={api}
              scrollRootRef={scrollRef}
            />
          ) : null
        )}
      </div>
    ),
    [api, julesSessionId]
  );

  if (!task) return null;

  const canOpenTerminal = task.provider === 'opencode' && api?.openOpenCodeSession;
  const transcriptPlusPending = [
    ...messages,
    ...pendingFollowUps.map((m) => ({
      id: m.id,
      role: 'user',
      content: m.text,
      timestamp: null,
    })),
  ];

  return (
    <div className="flex h-full min-h-0 flex-col">
      <header className="flex shrink-0 items-center gap-2 border-b border-border-light px-3 py-2.5 sm:gap-3 sm:px-4 dark:border-border-dark">
        <span className="flex h-7 w-7 shrink-0 items-center justify-center rounded-sm border border-border-light bg-card-light text-neutral-600 dark:border-border-dark dark:bg-card-dark dark:text-neutral-300">
          <meta.Icon size={14} />
        </span>
        <div className="min-w-0 flex-1">
          <h2 className="truncate text-[14px] font-semibold text-neutral-900 dark:text-neutral-100">
            {task.name || 'Task'}
          </h2>
          <p className="mt-0.5 flex items-center gap-1.5 truncate text-[11px] text-neutral-500 dark:text-neutral-400">
            <StatusDot status={liveStatus} className={status.pulse ? 'status-pulse' : ''} />
            {status.label} · {meta.label}
            {task.repository && (
              <span className="truncate font-mono">
                {' '}
                · {String(task.repository).replace(/[\\/]+$/, '').split(/[\\/]/).pop()}
              </span>
            )}
          </p>
        </div>
        <div className="flex shrink-0 items-center gap-1.5">
          {details?.webUrl || details?.prUrl || task.prUrl || task.webUrl ? (
            <button
              type="button"
              onClick={() => api?.openExternal?.(details?.webUrl || details?.prUrl || task.prUrl || task.webUrl)}
              aria-label="Go to task"
              className="inline-flex min-h-8 items-center gap-1.5 rounded-md border border-border-light px-2 py-1 text-[11px] font-medium text-neutral-600 transition-colors hover:bg-neutral-100 dark:border-border-dark dark:text-neutral-400 dark:hover:bg-neutral-800"
            >
              <IconExternal size={12} />
              <span className="hidden sm:inline">Go to task</span>
            </button>
          ) : null}
          {canOpenTerminal && details?.opencodeSessionId && (
            <button
              type="button"
              onClick={() =>
                api.openOpenCodeSession(details.opencodeSessionId, details.projectPath || task.repository)
              }
              aria-label="Open terminal"
              className="inline-flex min-h-8 items-center gap-1.5 rounded-md border border-border-light px-2 py-1 text-[11px] font-medium text-neutral-600 transition-colors hover:bg-neutral-100 dark:border-border-dark dark:text-neutral-400 dark:hover:bg-neutral-800"
            >
              <IconTerminal size={12} />
              <span className="hidden sm:inline">Terminal</span>
            </button>
          )}
          <button
            type="button"
            onClick={closeTask}
            aria-label="Close task"
            className="rounded-md p-1.5 text-neutral-400 transition-colors hover:bg-neutral-100 hover:text-neutral-700 dark:hover:bg-neutral-800 dark:hover:text-neutral-200"
          >
            <IconClose size={14} />
          </button>
        </div>
      </header>

      <div ref={scrollRef} className="min-h-0 flex-1 overflow-y-auto">
        <div className="mx-auto flex w-full max-w-3xl flex-col px-4 pb-4 pt-5">
          {hasTaskContext(details) && (
            <div className="mb-4">
              <TaskContextSection
                details={details}
                onOpenExternal={(url) => api?.openExternal?.(url)}
                onOpenOpenCodeSession={(sessionId, projectPath) =>
                  api?.openOpenCodeSession?.(sessionId, projectPath)
                }
              />
            </div>
          )}

          {loading && !details && !hasTranscript && (
            <p className="py-10 text-center text-[13px] text-neutral-400">Loading task…</p>
          )}

          {hasTranscript || pendingFollowUps.length > 0 ? (
            <ChatTranscript
              messages={transcriptPlusPending}
              assistantLabel={meta.label}
              renderContent={renderContent}
              renderCards={renderCards}
            />
          ) : details && !isWorking ? (
            <p className="py-10 text-center text-[13px] text-neutral-400">
              No transcript available for this task yet.
            </p>
          ) : null}

          {isWorking && (
            <div className="mt-4 flex items-center gap-2 pl-10 text-[13px] text-neutral-400">
              <IconSync size={14} className="animate-spin" />
              Working…
            </div>
          )}
        </div>
      </div>

      <div className="shrink-0 px-3 pb-3 pt-1 sm:px-4">
        <div className="mx-auto w-full max-w-3xl">
          {supportsFollowUp ? (
            <Composer
              value={followUp}
              onChange={setFollowUp}
              onSubmit={handleFollowUp}
              busy={sending}
              disabled={sending}
              minRows={1}
              maxRows={5}
              placeholder={`Send a follow-up to this ${meta.label} task…`}
              submitLabel="Send follow-up"
              footerNote={liveStatus === 'running' ? 'Task is running — the reply lands when the harness picks it up.' : undefined}
            />
          ) : (
            <p className="rounded-lg border border-dashed border-border-strong-light px-3 py-2.5 text-center text-[12px] text-neutral-400 dark:border-border-strong-dark dark:text-neutral-500">
              Follow-ups aren't supported for this harness yet.
            </p>
          )}
        </div>
      </div>
    </div>
  );
}
