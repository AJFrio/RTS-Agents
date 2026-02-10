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
      <div className="bg-sidebar-dark border border-border-dark w-full max-w-4xl max-h-[90vh] overflow-hidden flex flex-col rounded-xl">
        <div className="p-8 border-b border-border-dark">
          <button
            type="button"
            onClick={onClose}
            className="absolute top-4 right-4 text-slate-500 hover:text-primary transition-colors z-10"
          >
            <span className="material-symbols-outlined text-2xl">close</span>
          </button>
          <div className="flex items-start gap-4 mb-2">
            <ProviderBadge provider={agent.provider}>{providerName}</ProviderBadge>
            <h2 id="modal-title" className="text-2xl font-display font-bold text-white tracking-widest uppercase">
              {agent.name || 'Agent Details'}
            </h2>
          </div>
          <div className="flex items-center gap-3">
            <StatusBadge status={agent.status}>{statusLabel}</StatusBadge>
            <span className="text-[10px] technical-font text-slate-500">Task overview and activity</span>
          </div>
        </div>
        <div id="modal-content" className="flex-1 overflow-y-auto p-8">
          {loading && <LoadingSpinner />}
          {!loading && details && (
            <div
              className="markdown-content prose prose-invert max-w-none"
              dangerouslySetInnerHTML={{
                __html: typeof details.content === 'string' ? details.content : (typeof details === 'string' ? details : ''),
              }}
            />
          )}
          {!loading && !details && (
            <p className="text-slate-500">No details available.</p>
          )}
        </div>
        <div className="p-4 bg-black border-t border-border-dark flex justify-end items-center text-[9px] technical-font text-slate-600">
          <span id="modal-task-id">Task ID: {agent.rawId || agent.id || '--'}</span>
        </div>
      </div>
    </Modal>
  );
}
