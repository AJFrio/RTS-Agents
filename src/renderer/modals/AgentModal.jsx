import React, { useEffect, useState } from 'react';
import Modal from '../components/ui/Modal.jsx';
import { ProviderBadge, StatusBadge } from '../components/ui/Badge.jsx';
import LoadingSpinner from '../components/ui/LoadingSpinner.jsx';
import { getProviderDisplayName, getStatusLabel } from '../utils/format.js';

function getActivityTypeLabel(type) {
  if (!type) return 'Activity';
  return type
    .split('_')
    .map((w) => w.charAt(0).toUpperCase() + w.slice(1).toLowerCase())
    .join(' ');
}

export default function AgentModal({ agent, onClose, api }) {
  const [details, setDetails] = useState(null);
  const [loading, setLoading] = useState(!!agent);

  useEffect(() => {
    if (!agent || !api?.getAgentDetails) return;
    setLoading(true);
    setDetails(null);
    api
      .getAgentDetails(agent.provider, agent.rawId || agent.id, agent.filePath)
      .then((result) => {
        setDetails(result?.details ?? result);
      })
      .catch(console.error)
      .finally(() => setLoading(false));
  }, [agent?.provider, agent?.rawId, agent?.id, agent?.filePath, api]);

  if (!agent) return null;

  const providerName = getProviderDisplayName(agent.provider);
  const statusLabel = getStatusLabel(agent.status);

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
        <div id="modal-content" className="flex-1 overflow-y-auto p-8 bg-white dark:bg-background-dark">
          {loading && <LoadingSpinner />}
          {!loading && details && (() => {
            const hasContent = typeof details.content === 'string' && details.content.trim().length > 0;
            if (hasContent) {
              return (
                <div
                  className="markdown-content prose dark:prose-invert prose-sm max-w-none"
                  dangerouslySetInnerHTML={{ __html: details.content }}
                />
              );
            }
            const hasPrompt = details.prompt && String(details.prompt).trim();
            const hasSummary = details.summary && String(details.summary).trim();
            const hasActivities = details.activities?.length > 0;
            const hasConversation = details.conversation?.length > 0;
            const hasMessages = details.messages?.length > 0;
            if (!hasPrompt && !hasSummary && !hasActivities && !hasConversation && !hasMessages) {
              return <p className="text-slate-500">No details available.</p>;
            }
            return (
              <div className="space-y-6">
                {hasPrompt && (
                  <section>
                    <h3 className="text-xs font-semibold text-slate-500 dark:text-slate-400 mb-2">Prompt</h3>
                    <p className="text-sm text-slate-800 dark:text-slate-200 whitespace-pre-wrap">{details.prompt}</p>
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
                            <p className="text-sm text-slate-700 dark:text-slate-300 mt-2 whitespace-pre-wrap border-l-2 border-slate-100 dark:border-slate-700 pl-3">
                              {activity.message}
                            </p>
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
                          <p className="text-sm text-slate-800 dark:text-slate-200 whitespace-pre-wrap">{msg.text}</p>
                        </div>
                      ))}
                    </div>
                  </section>
                )}
                {hasMessages && (
                  <section>
                    <h3 className="text-xs font-semibold text-slate-500 dark:text-slate-400 mb-3">Messages</h3>
                    <div className="space-y-3">
                      {details.messages.map((msg, i) => (
                        <div
                          key={msg.id ?? i}
                          className={`p-3 rounded-lg ${msg.role === 'user' ? 'bg-primary/10 dark:bg-primary/20 border-l-2 border-primary' : 'bg-slate-100 dark:bg-slate-800'}`}
                        >
                          <span className="text-xs font-semibold text-slate-500 dark:text-slate-400 block mb-1">
                            {msg.role === 'user' ? 'You' : 'Assistant'}
                          </span>
                          <p className="text-sm text-slate-800 dark:text-slate-200 whitespace-pre-wrap">{msg.content}</p>
                        </div>
                      ))}
                    </div>
                  </section>
                )}
              </div>
            );
          })()}
          {!loading && !details && (
            <p className="text-slate-500">No details available.</p>
          )}
        </div>
        <div className="p-4 bg-slate-50 dark:bg-black border-t border-slate-200 dark:border-border-dark flex justify-end items-center text-[10px] technical-font text-slate-600">
          <span id="modal-task-id">Task ID: {agent.rawId || agent.id || '--'}</span>
        </div>
      </div>
    </Modal>
  );
}
