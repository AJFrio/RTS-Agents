import React, { useCallback, useEffect, useRef, useState } from 'react';
import Modal from '../components/ui/Modal.jsx';
import { ProviderBadge, StatusBadge } from '../components/ui/Badge.jsx';
import LoadingSpinner from '../components/ui/LoadingSpinner.jsx';
import ChatTranscript from '../components/ui/ChatTranscript.jsx';
import PastedImageModal from './PastedImageModal.jsx';
import { getProviderDisplayName, getStatusLabel } from '../utils/format.js';
import { parseMarkdown } from '../utils/markdown.js';
import DOMPurify from 'dompurify';

function MarkdownBlock({ content, className = '' }) {
  return (
    <div
      className={`prose prose-sm max-w-none text-slate-800 dark:prose-invert dark:text-slate-200 ${className}`}
      dangerouslySetInnerHTML={{
        __html: DOMPurify.sanitize(parseMarkdown(String(content ?? ''))),
      }}
    />
  );
}

function getActivityTypeLabel(type) {
  if (!type) return 'Activity';
  return type
    .split('_')
    .map((w) => w.charAt(0).toUpperCase() + w.slice(1).toLowerCase())
    .join(' ');
}

function hasTaskContext(details) {
  if (!details) return false;
  const hasRepository = details.repository && String(details.repository).trim();
  const hasBranch = details.branch && String(details.branch).trim();
  const hasPrUrl = details.prUrl && String(details.prUrl).trim();
  const hasRuns = details.runs?.length > 0;
  const hasLatestRun = details.latestRunId && String(details.latestRunId).trim();
  const hasOpenCodeSession =
    details.opencodeSessionId && String(details.opencodeSessionId).trim();
  const hasTrackingId = details.trackingId && String(details.trackingId).trim();
  return !!(
    hasRepository ||
    hasBranch ||
    hasPrUrl ||
    hasRuns ||
    hasLatestRun ||
    hasOpenCodeSession ||
    hasTrackingId
  );
}

function ActivityMediaLazy({ sessionId, activity, api, scrollRootRef }) {
  const containerRef = useRef(null);
  const [mediaItems, setMediaItems] = useState(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState(null);
  const [lightboxUrl, setLightboxUrl] = useState(null);
  const fetchedRef = useRef(false);

  const loadMedia = useCallback(() => {
    if (fetchedRef.current || !api?.getJulesActivityMedia || !sessionId || !activity?.id) return;
    fetchedRef.current = true;
    setLoading(true);
    setError(null);
    api
      .getJulesActivityMedia(sessionId, activity.id)
      .then((result) => {
        setMediaItems(result?.mediaItems ?? []);
      })
      .catch((err) => {
        console.error(err);
        setError(err?.message || 'Failed to load verification media');
      })
      .finally(() => setLoading(false));
  }, [api, sessionId, activity?.id]);

  useEffect(() => {
    fetchedRef.current = false;
    setMediaItems(null);
    setError(null);
    setLoading(false);
  }, [sessionId, activity?.id]);

  useEffect(() => {
    if (!activity?.hasMedia) return undefined;
    const target = containerRef.current;
    if (!target) return undefined;

    const root = scrollRootRef?.current ?? null;
    const observer = new IntersectionObserver(
      (entries) => {
        if (entries.some((entry) => entry.isIntersecting)) {
          loadMedia();
          observer.disconnect();
        }
      },
      { root, rootMargin: '120px', threshold: 0.01 }
    );

    observer.observe(target);
    return () => observer.disconnect();
  }, [activity?.hasMedia, activity?.id, loadMedia, scrollRootRef]);

  if (!activity?.hasMedia) return null;

  return (
    <div ref={containerRef} className="mt-3 space-y-2">
      {loading && (
        <div className="rounded-lg border border-dashed border-slate-200 dark:border-border-dark bg-slate-50 dark:bg-slate-900/50 px-3 py-4 text-xs text-slate-500">
          Loading verification capture…
        </div>
      )}
      {error && !loading && (
        <p className="text-xs text-red-600 dark:text-red-400">{error}</p>
      )}
      {mediaItems?.length > 0 && (
        <div
          className={`grid gap-2 ${mediaItems.length > 1 ? 'grid-cols-1 sm:grid-cols-2' : 'grid-cols-1'}`}
        >
          {mediaItems.map((item, index) => (
            <div
              key={`${item.mimeType}-${index}`}
              className="overflow-hidden rounded-lg border border-slate-200 dark:border-border-dark bg-slate-50 dark:bg-black/30"
            >
              {item.kind === 'video' ? (
                <video
                  src={item.dataUrl}
                  controls
                  preload="metadata"
                  className="max-h-80 w-full bg-black"
                />
              ) : (
                <button
                  type="button"
                  onClick={() => setLightboxUrl(item.dataUrl)}
                  className="block w-full text-left"
                >
                  <img
                    src={item.dataUrl}
                    alt="UI verification capture"
                    loading="lazy"
                    className="max-h-80 w-full object-contain bg-black cursor-zoom-in"
                  />
                </button>
              )}
            </div>
          ))}
        </div>
      )}
      {!loading && !error && mediaItems?.length === 0 && fetchedRef.current && (
        <p className="text-xs text-slate-500">No verification media available.</p>
      )}
      <PastedImageModal imageUrl={lightboxUrl} onClose={() => setLightboxUrl(null)} />
    </div>
  );
}

function TaskContextSection({ details, onOpenExternal, onOpenOpenCodeSession }) {
  if (!hasTaskContext(details)) return null;

  const latestRun = details.runs?.find((run) => run.id === details.latestRunId) || details.runs?.[0];
  const projectPath = details.projectPath || details.repository;

  return (
    <section>
      <h3 className="text-xs font-semibold text-slate-500 dark:text-slate-400 mb-2">Task context</h3>
      <dl className="space-y-2 text-sm text-slate-800 dark:text-slate-200">
        {details.repository && (
          <div>
            <dt className="text-[10px] font-semibold uppercase tracking-wide text-slate-500">Repository</dt>
            <dd className="break-all">{details.repository}</dd>
          </div>
        )}
        {details.branch && (
          <div>
            <dt className="text-[10px] font-semibold uppercase tracking-wide text-slate-500">Branch</dt>
            <dd>{details.branch}</dd>
          </div>
        )}
        {details.prUrl && (
          <div>
            <dt className="text-[10px] font-semibold uppercase tracking-wide text-slate-500">Pull request</dt>
            <dd>
              <button
                type="button"
                onClick={() => onOpenExternal(details.prUrl)}
                className="text-blue-500 hover:text-blue-600 dark:text-blue-400 dark:hover:text-blue-300 break-all text-left"
              >
                {details.prUrl}
              </button>
            </dd>
          </div>
        )}
        {details.latestRunId && (
          <div>
            <dt className="text-[10px] font-semibold uppercase tracking-wide text-slate-500">Latest run</dt>
            <dd className="technical-font text-xs">
              {details.latestRunId}
              {latestRun?.status ? ` (${latestRun.status})` : ''}
            </dd>
          </div>
        )}
        {details.opencodeSessionId && (
          <div>
            <dt className="text-[10px] font-semibold uppercase tracking-wide text-slate-500">
              OpenCode session
            </dt>
            <dd>
              {onOpenOpenCodeSession && projectPath ? (
                <button
                  type="button"
                  onClick={() => onOpenOpenCodeSession(details.opencodeSessionId, projectPath)}
                  className="technical-font text-xs text-blue-500 hover:text-blue-600 dark:text-blue-400 dark:hover:text-blue-300 break-all text-left"
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
          <div>
            <dt className="text-[10px] font-semibold uppercase tracking-wide text-slate-500">
              Tracking ID
            </dt>
            <dd className="technical-font text-xs break-all">{details.trackingId}</dd>
          </div>
        )}
      </dl>
    </section>
  );
}

export default function AgentModal({ agent, onClose, api }) {
  const [details, setDetails] = useState(null);
  const [detailsError, setDetailsError] = useState(null);
  const [loading, setLoading] = useState(!!agent);
  const scrollRootRef = useRef(null);

  const sessionId =
    agent?.provider === 'jules'
      ? String(agent.rawId || agent.id || '').replace(/^jules-/, '')
      : null;

  useEffect(() => {
    if (!agent) return;

    setLoading(true);
    setDetails(null);
    setDetailsError(null);

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
  }, [agent?.provider, agent?.rawId, agent?.id, agent?.filePath, api]);

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

  return (
    <Modal open={!!agent} onClose={onClose}>
      <div id="agent-modal" className="bg-white dark:bg-sidebar-dark border border-slate-200 dark:border-border-dark w-full max-w-4xl max-h-[90vh] overflow-hidden flex flex-col shadow-2xl rounded-2xl">
        <div className="p-6 border-b border-slate-200 dark:border-border-dark flex justify-between items-start bg-white dark:bg-black/40">
          <div className="flex-1 mr-8">
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
            <h2 id="modal-title" className="text-xl font-display font-bold text-slate-900 dark:text-white truncate">
              {details?.name ?? agent.name ?? 'Agent Details'}
            </h2>
            <div className="mt-1 text-[10px] technical-font text-slate-500">Task overview and activity</div>
          </div>
          <button
            type="button"
            onClick={onClose}
            className="text-slate-500 hover:text-slate-700 dark:hover:text-primary transition-colors"
          >
            <span className="material-symbols-outlined">close</span>
          </button>
        </div>
        <div
          id="modal-content"
          ref={scrollRootRef}
          className="flex-1 overflow-y-auto p-8 bg-white dark:bg-background-dark"
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
              <div className="space-y-6">
                {hasContext && (
                  <TaskContextSection
                    details={details}
                    onOpenExternal={(url) => api.openExternal(url)}
                    onOpenOpenCodeSession={
                      agent.provider === 'opencode' && api?.openOpenCodeSession
                        ? (sessionId, projectPath) => api.openOpenCodeSession(sessionId, projectPath)
                        : null
                    }
                  />
                )}
                {hasPrompt && (
                  <section>
                    <h3 className="text-xs font-semibold text-slate-500 dark:text-slate-400 mb-2">Prompt</h3>
                    <MarkdownBlock content={details.prompt} />
                  </section>
                )}
                {hasSummary && (
                  <section>
                    <h3 className="text-xs font-semibold text-slate-500 dark:text-slate-400 mb-2">Summary</h3>
                    <p className="text-sm text-slate-800 dark:text-slate-200 whitespace-pre-wrap">{details.summary}</p>
                  </section>
                )}
                {hasActivities && (
                  <section>
                    <h3 className="text-xs font-semibold text-slate-500 dark:text-slate-400 mb-3">Activity</h3>
                    <div className="space-y-4">
                      {details.activities.map((activity) => (
                        <div
                          key={activity.id}
                          className="border-l-2 border-slate-200 dark:border-border-dark pl-4 py-1"
                        >
                          <div className="flex items-center gap-2 mb-1 flex-wrap">
                            <span className="text-xs font-medium text-primary">
                              {getActivityTypeLabel(activity.type)}
                            </span>
                            {activity.timestamp && (
                              <span className="text-[10px] technical-font text-slate-500">
                                {new Date(activity.timestamp).toLocaleString()}
                              </span>
                            )}
                            {activity.originator && activity.originator !== 'system' && (
                              <span className="text-[10px] text-slate-500">({activity.originator})</span>
                            )}
                          </div>
                          {activity.title && (
                            <p className="text-sm font-medium text-slate-800 dark:text-slate-200">{activity.title}</p>
                          )}
                          {activity.description && (
                            <p className="text-xs text-slate-600 dark:text-slate-400 mt-1">{activity.description}</p>
                          )}
                          {activity.message && (
                            <MarkdownBlock
                              content={activity.message}
                              className="mt-2 border-l-2 border-slate-100 pl-3 text-slate-700 dark:border-slate-700 dark:text-slate-300"
                            />
                          )}
                          {activity.planSteps?.length > 0 && (
                            <ul className="mt-2 space-y-1 text-xs text-slate-600 dark:text-slate-400">
                              {activity.planSteps.map((step, i) => (
                                <li key={i}>
                                  <span className="font-medium">{step.title}</span>
                                  {step.description && ` — ${step.description}`}
                                </li>
                              ))}
                            </ul>
                          )}
                          {((activity.commands?.length > 0) || (activity.fileChanges?.length > 0)) && (
                            <div className="mt-2 text-[10px] text-slate-500">
                              {activity.commands?.length > 0 && (
                                <span>{activity.commands.length} command(s)</span>
                              )}
                              {activity.commands?.length > 0 && activity.fileChanges?.length > 0 && ' · '}
                              {activity.fileChanges?.length > 0 && (
                                <span>{activity.fileChanges.length} file(s) changed</span>
                              )}
                            </div>
                          )}
                          {agent.provider === 'jules' && sessionId && (
                            <ActivityMediaLazy
                              sessionId={sessionId}
                              activity={activity}
                              api={api}
                              scrollRootRef={scrollRootRef}
                            />
                          )}
                        </div>
                      ))}
                    </div>
                  </section>
                )}
                {hasConversation && (
                  <section>
                    <h3 className="text-xs font-semibold text-slate-500 dark:text-slate-400 mb-3">Conversation</h3>
                    <div className="space-y-3">
                      {details.conversation.map((msg, i) => (
                        <div
                          key={msg.id ?? i}
                          className={`p-3 rounded-lg ${msg.isUser ? 'bg-primary/10 dark:bg-primary/20 border-l-2 border-primary' : 'bg-slate-100 dark:bg-slate-800'}`}
                        >
                          <span className="text-xs font-semibold text-slate-500 dark:text-slate-400 block mb-1">
                            {msg.isUser ? 'You' : 'Agent'}
                          </span>
                          <MarkdownBlock content={msg.text} />
                        </div>
                      ))}
                    </div>
                  </section>
                )}
                {hasMessages && (
                  <section>
                    <div className="mb-3 flex items-center justify-between gap-2">
                      <h3 className="text-xs font-semibold text-slate-500 dark:text-slate-400">Messages</h3>
                      {agent.provider === 'opencode' && openCodeSessionId && openCodeProjectPath && (
                        <button
                          type="button"
                          onClick={handleOpenOpenCodeSession}
                          className="text-xs text-blue-500 hover:text-blue-600 dark:text-blue-400 dark:hover:text-blue-300 flex items-center gap-1"
                        >
                          <span className="material-symbols-outlined text-[14px]">terminal</span>
                          Open in terminal
                        </button>
                      )}
                    </div>
                    <ChatTranscript
                      messages={details.messages}
                      renderContent={(content) => <MarkdownBlock content={content} />}
                    />
                  </section>
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
        <div className="p-4 bg-slate-50 dark:bg-black border-t border-slate-200 dark:border-border-dark flex flex-col items-end gap-1 text-[10px] technical-font text-slate-600">
          {agent.provider === 'opencode' ? (
            <>
              <span id="modal-task-id">Tracking ID: {agent.rawId || agent.id || '--'}</span>
              {openCodeSessionId ? (
                <button
                  type="button"
                  id="modal-opencode-session-id"
                  onClick={handleOpenOpenCodeSession}
                  disabled={!openCodeProjectPath || !api?.openOpenCodeSession}
                  className="text-blue-500 hover:text-blue-600 dark:text-blue-400 dark:hover:text-blue-300 disabled:opacity-50 disabled:cursor-not-allowed text-left"
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
            <span id="modal-task-id">Task ID: {agent.rawId || agent.id || '--'}</span>
          )}
        </div>
      </div>
    </Modal>
  );
}
