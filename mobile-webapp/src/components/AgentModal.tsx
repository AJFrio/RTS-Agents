/**
 * Agent Modal Component
 * 
 * Full-screen modal for viewing agent details
 */

import { useState } from 'react';
import { marked } from 'marked';
import DOMPurify from 'dompurify';
import { useApp } from '../store/AppContext';
import type { Activity, ConversationMessage, Message } from '../store/types';
import { julesService } from '../services/jules-service';
import { cursorService } from '../services/cursor-service';
import { codexService } from '../services/codex-service';
import { claudeService } from '../services/claude-service';

const providerStyles: Record<string, { text: string; bg: string }> = {
  jules: { text: 'text-primary', bg: 'bg-primary/10' },
  cursor: { text: 'text-blue-500', bg: 'bg-blue-500/10' },
  codex: { text: 'text-cyan-500', bg: 'bg-cyan-500/10' },
  'claude-cloud': { text: 'text-amber-500', bg: 'bg-amber-500/10' },
};

const statusStyles: Record<string, { bg: string; text: string }> = {
  running: { bg: 'bg-yellow-500/20', text: 'text-yellow-500' },
  completed: { bg: 'bg-primary', text: 'text-black' },
  pending: { bg: 'bg-slate-700', text: 'text-slate-400' },
  failed: { bg: 'bg-red-500/20', text: 'text-red-500' },
  stopped: { bg: 'bg-slate-700', text: 'text-slate-400' },
};

function renderMarkdown(content: string): string {
  try {
    const html = marked.parse(content, { async: false }) as string;
    return DOMPurify.sanitize(html);
  } catch {
    return DOMPurify.sanitize(content);
  }
}

function formatDate(date: Date | null | undefined): string {
  if (!date) return '--';
  return new Date(date).toLocaleString();
}

export default function AgentModal() {
  const { state, dispatch } = useApp();
  const { selectedAgent, showAgentModal, loadingAgent } = state;
  const [followupPrompt, setFollowupPrompt] = useState('');
  const [sendingFollowup, setSendingFollowup] = useState(false);

  const handleClose = () => {
    dispatch({ type: 'SET_SHOW_AGENT_MODAL', payload: false });
    dispatch({ type: 'SET_SELECTED_AGENT', payload: null });
    setFollowupPrompt('');
  };

  const handleOpenExternal = () => {
    if (selectedAgent?.webUrl) {
      window.open(selectedAgent.webUrl, '_blank');
    }
  };

  const handleOpenPR = () => {
    if (selectedAgent?.prUrl) {
      window.open(selectedAgent.prUrl, '_blank');
    }
  };

  const handleSendFollowup = async () => {
    if (!selectedAgent || !followupPrompt.trim() || sendingFollowup) return;

    setSendingFollowup(true);
    try {
      const { provider, rawId } = selectedAgent;

      switch (provider) {
        case 'jules':
          await julesService.sendFollowup(rawId, followupPrompt);
          break;
        case 'cursor':
          await cursorService.sendFollowup(rawId, followupPrompt);
          break;
        case 'codex':
          await codexService.sendFollowup(rawId, followupPrompt);
          break;
        case 'claude-cloud':
          await claudeService.sendFollowup(rawId, followupPrompt);
          break;
      }

      setFollowupPrompt('');

      // Refresh agent details
      const service =
        provider === 'jules' ? julesService :
        provider === 'cursor' ? cursorService :
        provider === 'codex' ? codexService :
        provider === 'claude-cloud' ? claudeService : null;

      if (service) {
        dispatch({ type: 'SET_LOADING_AGENT', payload: true });
        const details = await service.getAgentDetails(rawId);
        dispatch({ type: 'SET_SELECTED_AGENT', payload: details });
      }

    } catch (err) {
      console.error('Error sending follow-up:', err);
      // Ideally show a toast or error message here
    } finally {
      setSendingFollowup(false);
      dispatch({ type: 'SET_LOADING_AGENT', payload: false });
    }
  };

  if (!showAgentModal) return null;

  const provider = selectedAgent ? providerStyles[selectedAgent.provider] || providerStyles.cursor : providerStyles.cursor;
  const status = selectedAgent ? statusStyles[selectedAgent.status] || statusStyles.pending : statusStyles.pending;

  return (
    <div className="fixed inset-0 z-50 bg-background-light dark:bg-background-dark">
      {/* Header */}
      <header className="h-14 flex items-center justify-between px-4 border-b border-slate-200 dark:border-border-dark bg-white dark:bg-sidebar-dark safe-top shadow-sm">
        <button
          onClick={handleClose}
          className="p-2 -ml-2 text-slate-500 dark:text-slate-400 hover:text-slate-900 dark:hover:text-white transition-colors"
        >
          <span className="material-symbols-outlined">arrow_back</span>
        </button>

        <div className="flex items-center gap-2">
          {selectedAgent?.webUrl && (
            <button
              onClick={handleOpenExternal}
              className="p-2 text-slate-500 dark:text-slate-400 hover:text-primary transition-colors"
            >
              <span className="material-symbols-outlined">open_in_new</span>
            </button>
          )}
        </div>
      </header>

      {/* Content */}
      <div className="h-[calc(100vh-56px)] overflow-y-auto safe-bottom">
        {loadingAgent ? (
          <div className="flex flex-col items-center justify-center h-64">
            <span className="material-symbols-outlined text-primary text-4xl animate-spin">sync</span>
            <p className="mt-4 text-sm text-slate-500">Loading details...</p>
          </div>
        ) : selectedAgent ? (
          <div className="p-4 space-y-6">
            {/* Agent Header */}
            <div>
              <div className="flex items-center gap-2 mb-2">
                <span className={`px-2.5 py-1 text-xs font-medium rounded-md ${provider.bg} ${provider.text}`}>
                  {selectedAgent.provider === 'claude-cloud' ? 'Claude' : selectedAgent.provider.charAt(0).toUpperCase() + selectedAgent.provider.slice(1)}
                </span>
                <span className={`px-2.5 py-1 text-xs font-medium rounded-md ${status.bg} ${status.text}`}>
                  {selectedAgent.status.charAt(0).toUpperCase() + selectedAgent.status.slice(1)}
                </span>
              </div>
              <h2 className="text-xl font-bold text-slate-900 dark:text-white mb-2">{selectedAgent.name}</h2>
              
              {/* Metadata */}
              <div className="space-y-1 text-xs text-slate-500 dark:text-slate-400">
                {selectedAgent.repository && (
                  <div className="flex items-center gap-2">
                    <span className="material-symbols-outlined text-sm">folder</span>
                    <span className="truncate">{selectedAgent.repository}</span>
                  </div>
                )}
                {selectedAgent.branch && (
                  <div className="flex items-center gap-2">
                    <span className="material-symbols-outlined text-sm">fork_right</span>
                    <span>{selectedAgent.branch}</span>
                  </div>
                )}
                <div className="flex items-center gap-2">
                  <span className="material-symbols-outlined text-sm">schedule</span>
                  <span>Created: {formatDate(selectedAgent.createdAt)}</span>
                </div>
                {selectedAgent.updatedAt && (
                  <div className="flex items-center gap-2">
                    <span className="material-symbols-outlined text-sm">update</span>
                    <span>Updated: {formatDate(selectedAgent.updatedAt)}</span>
                  </div>
                )}
              </div>
            </div>

            {/* PR Button */}
            {selectedAgent.prUrl && (
              <button
                onClick={handleOpenPR}
                className="w-full flex items-center justify-center gap-2 bg-emerald-600 text-white py-3 text-sm font-semibold rounded-lg shadow-sm hover:shadow-md active:scale-[0.98] transition-all duration-200"
              >
                <span className="material-symbols-outlined text-sm">merge</span>
                View Pull Request
              </button>
            )}

            {/* Prompt */}
            {selectedAgent.prompt && (
              <div className="bg-white dark:bg-card-dark border border-slate-200 dark:border-border-dark p-4 rounded-xl shadow-sm">
                <h3 className="text-xs font-semibold text-slate-500 dark:text-slate-400 mb-2">Prompt</h3>
                <p className="text-sm text-slate-600 dark:text-slate-300 whitespace-pre-wrap">{selectedAgent.prompt}</p>
              </div>
            )}

            {/* Summary */}
            {selectedAgent.summary && (
              <div className="bg-white dark:bg-card-dark border border-slate-200 dark:border-border-dark p-4 rounded-xl shadow-sm">
                <h3 className="text-xs font-semibold text-slate-500 dark:text-slate-400 mb-2">Summary</h3>
                <div
                  className="prose prose-sm prose-invert max-w-none text-slate-600 dark:text-slate-300"
                  dangerouslySetInnerHTML={{ __html: renderMarkdown(selectedAgent.summary) }}
                />
              </div>
            )}

            {/* Activities (Jules) */}
            {selectedAgent.activities && selectedAgent.activities.length > 0 && (
              <div className="bg-white dark:bg-card-dark border border-slate-200 dark:border-border-dark p-4 rounded-xl shadow-sm">
                <h3 className="text-xs font-semibold text-slate-500 dark:text-slate-400 mb-3">Activities</h3>
                <div className="space-y-3">
                  {selectedAgent.activities.map((activity: Activity) => (
                    <div key={activity.id} className="border-l-2 border-slate-200 dark:border-border-dark pl-3">
                      <div className="flex items-center gap-2 mb-1">
                        <span className="text-xs text-primary font-medium">
                          {activity.type.replace('_', ' ')}
                        </span>
                        {activity.timestamp && (
                          <span className="text-[10px] text-slate-500">
                            {new Date(activity.timestamp).toLocaleTimeString()}
                          </span>
                        )}
                      </div>
                      {activity.title && (
                        <p className="text-sm font-medium text-slate-900 dark:text-slate-300">{activity.title}</p>
                      )}
                      {activity.description && (
                        <p className="text-xs text-slate-500 dark:text-slate-400 mt-1">{activity.description}</p>
                      )}
                    </div>
                  ))}
                </div>
              </div>
            )}

            {/* Conversation (Cursor) */}
            {selectedAgent.conversation && selectedAgent.conversation.length > 0 && (
              <div className="bg-white dark:bg-card-dark border border-slate-200 dark:border-border-dark p-4 rounded-xl shadow-sm">
                <h3 className="text-xs font-semibold text-slate-500 dark:text-slate-400 mb-3">Conversation</h3>
                <div className="space-y-3">
                  {selectedAgent.conversation.map((msg: ConversationMessage) => (
                    <div
                      key={msg.id}
                      className={`p-3 rounded-lg ${msg.isUser ? 'bg-primary/10 border-l-2 border-primary' : 'bg-slate-100 dark:bg-slate-800'}`}
                    >
                      <span className="text-xs font-semibold text-slate-500 dark:text-slate-400 mb-1 block">
                        {msg.isUser ? 'You' : 'Agent'}
                      </span>
                      <div
                        className="prose prose-sm prose-invert max-w-none text-slate-600 dark:text-slate-300"
                        dangerouslySetInnerHTML={{ __html: renderMarkdown(msg.text) }}
                      />
                    </div>
                  ))}
                </div>
              </div>
            )}

            {/* Messages (Codex/Claude) */}
            {selectedAgent.messages && selectedAgent.messages.length > 0 && (
              <div className="bg-white dark:bg-card-dark border border-slate-200 dark:border-border-dark p-4 rounded-xl shadow-sm">
                <h3 className="text-xs font-semibold text-slate-500 dark:text-slate-400 mb-3">Messages</h3>
                <div className="space-y-3">
                  {selectedAgent.messages.map((msg: Message) => (
                    <div
                      key={msg.id}
                      className={`p-3 rounded-lg ${msg.role === 'user' ? 'bg-primary/10 border-l-2 border-primary' : 'bg-slate-100 dark:bg-slate-800'}`}
                    >
                      <span className="text-xs font-semibold text-slate-500 dark:text-slate-400 mb-1 block">
                        {msg.role === 'user' ? 'You' : 'Assistant'}
                      </span>
                      <div
                        className="prose prose-sm prose-invert max-w-none text-slate-600 dark:text-slate-300"
                        dangerouslySetInnerHTML={{ __html: renderMarkdown(msg.content) }}
                      />
                    </div>
                  ))}
                </div>
              </div>
            )}

            {/* Follow-up Prompt */}
            {(selectedAgent.status === 'completed' || selectedAgent.status === 'failed') && (
              <div className="bg-white dark:bg-card-dark border border-slate-200 dark:border-border-dark p-4 rounded-xl shadow-sm mt-6">
                <h3 className="text-xs font-semibold text-slate-500 dark:text-slate-400 mb-2">Follow-up</h3>
                <div className="space-y-3">
                  <textarea
                    value={followupPrompt}
                    onChange={(e) => setFollowupPrompt(e.target.value)}
                    placeholder="Enter your follow-up prompt here..."
                    className="w-full bg-slate-50 dark:bg-slate-900 border border-slate-200 dark:border-border-dark rounded-lg p-3 text-sm text-slate-900 dark:text-white placeholder-slate-400 dark:placeholder-slate-500 focus:outline-none focus:border-primary focus:ring-2 focus:ring-primary/20 resize-y min-h-[80px] transition-all duration-200"
                    disabled={sendingFollowup}
                  />
                  <div className="flex justify-end">
                    <button
                      onClick={handleSendFollowup}
                      disabled={!followupPrompt.trim() || sendingFollowup}
                      className="flex items-center gap-2 bg-primary text-black px-4 py-2 text-sm font-semibold rounded-lg shadow-sm hover:shadow-md active:scale-[0.98] transition-all duration-200 disabled:opacity-50 disabled:cursor-not-allowed"
                    >
                      {sendingFollowup ? (
                        <span className="material-symbols-outlined text-sm animate-spin">sync</span>
                      ) : (
                        <span className="material-symbols-outlined text-sm">send</span>
                      )}
                      Send Follow-up
                    </button>
                  </div>
                </div>
              </div>
            )}

            {/* Task ID */}
            <div className="text-center pt-4">
              <span className="text-xs text-slate-600">
                Task ID: {selectedAgent.rawId}
              </span>
            </div>
          </div>
        ) : (
          <div className="flex flex-col items-center justify-center h-64">
            <span className="material-symbols-outlined text-slate-500 text-4xl">info</span>
            <p className="mt-2 text-slate-500 text-sm">No agent selected</p>
          </div>
        )}
      </div>
    </div>
  );
}
