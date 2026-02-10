import React, { useEffect, useState } from 'react';
import Modal from '../components/ui/Modal.jsx';
import { ProviderBadge, StatusBadge } from '../components/ui/Badge.jsx';
import LoadingSpinner from '../components/ui/LoadingSpinner.jsx';
import { getProviderDisplayName, getStatusLabel } from '../utils/format.js';

function escapeHtml(s) {
  if (!s) return '';
  const div = document.createElement('div');
  div.textContent = s;
  return div.innerHTML;
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
      <div className="bg-white dark:bg-sidebar-dark border border-slate-200 dark:border-border-dark w-full max-w-4xl max-h-[90vh] overflow-hidden flex flex-col shadow-2xl rounded-2xl">
        <div className="p-6 border-b border-slate-200 dark:border-border-dark flex justify-between items-start bg-white dark:bg-black/40">
          <div className="flex-1 mr-8">
            <div className="flex items-center gap-3 mb-2">
              <ProviderBadge provider={agent.provider}>{providerName}</ProviderBadge>
              <StatusBadge status={agent.status}>{statusLabel}</StatusBadge>
            </div>
            <h2 id="modal-title" className="text-xl font-display font-bold text-slate-900 dark:text-white truncate">
              {agent.name || 'Agent Details'}
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
          {!loading && details && (
            <div
              className="markdown-content prose dark:prose-invert prose-sm max-w-none"
              dangerouslySetInnerHTML={{
                __html: typeof details.content === 'string' ? details.content : (typeof details === 'string' ? details : ''),
              }}
            />
          )}
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
