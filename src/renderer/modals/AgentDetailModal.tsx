import React, { useEffect, useState } from 'react';
import { useApp } from '../context/AppContext';
import { marked } from 'marked';
import DOMPurify from 'dompurify';

const AgentDetailModal: React.FC = () => {
  const { modals, closeModal } = useApp();
  const { open, provider, agentId, filePath } = modals.agentDetail;
  const [details, setDetails] = useState<any>(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [message, setMessage] = useState('');
  const [sending, setSending] = useState(false);

  useEffect(() => {
    if (open && provider && agentId) {
      loadDetails();
    }
  }, [open, provider, agentId, filePath]);

  const loadDetails = async () => {
    if (!window.electronAPI || !provider || !agentId) return;
    setLoading(true);
    setError(null);
    try {
      const result = await window.electronAPI.getAgentDetails(provider, agentId, filePath);
      setDetails(result);
    } catch (err) {
      setError(String(err));
    } finally {
      setLoading(false);
    }
  };

  const handleSendMessage = async () => {
    if (!message.trim() || !provider || !agentId) return;
    setSending(true);
    try {
      await window.electronAPI.sendMessage(provider, agentId, message);
      setMessage('');
      // Refresh details
      setTimeout(loadDetails, 1000);
    } catch (err) {
      alert(`Failed to send: ${err}`);
    } finally {
      setSending(false);
    }
  };

  if (!open) return null;

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-4">
      <div className="fixed inset-0 bg-black/80 backdrop-blur-sm" onClick={() => closeModal('agentDetail')}></div>

      <div className="relative bg-sidebar-dark border border-border-dark w-full max-w-4xl max-h-[90vh] overflow-hidden flex flex-col rounded-xl">
        <div className="p-8 border-b border-border-dark relative">
          <button onClick={() => closeModal('agentDetail')} className="absolute top-4 right-4 text-slate-500 hover:text-primary transition-colors z-10">
            <span className="material-symbols-outlined text-2xl">close</span>
          </button>

          {loading ? (
            <div className="flex items-center justify-center h-12">
              <span className="material-symbols-outlined text-primary text-4xl animate-spin">sync</span>
            </div>
          ) : error ? (
            <div className="text-red-400">Error: {error}</div>
          ) : details ? (
            <>
              <div className="flex items-start gap-4 mb-2">
                <span className="px-3 py-1 text-[10px] technical-font border border-primary text-primary">{provider?.toUpperCase()}</span>
                <h2 className="text-2xl font-display font-bold text-white tracking-widest uppercase">{details.name || 'Agent Details'}</h2>
              </div>
              <div className="flex items-center gap-3">
                <span className="px-2 py-0.5 text-[10px] technical-font bg-primary text-black font-bold">{details.status?.toUpperCase()}</span>
                <span className="text-[10px] technical-font text-slate-500">TASK ID: {agentId}</span>
              </div>
            </>
          ) : null}
        </div>

        <div className="flex-1 overflow-y-auto p-8 space-y-8">
          {details && (
            <>
              {/* Info Grid */}
              <div className="grid grid-cols-2 gap-4">
                <div className="bg-card-dark border border-border-dark p-4">
                  <div className="text-[9px] technical-font text-primary mb-2">Info</div>
                  <div className="space-y-3">
                    <div className="flex flex-col">
                      <span className="text-[9px] technical-font text-slate-500">Created</span>
                      <span className="text-xs font-mono text-slate-300">{details.createdAt ? new Date(details.createdAt).toLocaleString() : '--'}</span>
                    </div>
                  </div>
                </div>
                {/* Repo info if exists */}
                {details.repository && (
                  <div className="bg-card-dark border border-border-dark p-4">
                    <div className="text-[9px] technical-font text-primary mb-2">Repo</div>
                    <div className="text-xs font-mono text-slate-300">{details.repository}</div>
                  </div>
                )}
              </div>

              {/* Prompt */}
              {details.prompt && (
                <section>
                  <div className="flex items-center gap-2 mb-3 border-l-2 border-primary pl-3">
                    <span className="material-symbols-outlined text-sm text-primary">edit_note</span>
                    <h3 className="text-[11px] technical-font text-primary font-bold">Task Description</h3>
                  </div>
                  <div className="bg-card-dark border border-border-dark p-6">
                    <div className="markdown-content text-sm text-slate-300 font-light leading-relaxed"
                      dangerouslySetInnerHTML={{ __html: DOMPurify.sanitize(marked.parse(details.prompt) as string) }}
                    />
                  </div>
                </section>
              )}

              {/* Messages/Activities */}
              {((details.messages && details.messages.length > 0) || (details.conversation && details.conversation.length > 0)) && (
                <section>
                  <div className="flex items-center gap-2 mb-3 border-l-2 border-primary pl-3">
                    <span className="material-symbols-outlined text-sm text-primary">chat</span>
                    <h3 className="text-[11px] technical-font text-primary font-bold">Conversation</h3>
                  </div>
                  <div className="space-y-3 max-h-72 overflow-y-auto pr-2 mb-4">
                    {(details.messages || details.conversation).map((msg: any, i: number) => (
                      <div key={i} className={`flex ${msg.role === 'user' || msg.isUser ? 'justify-end' : 'justify-start'}`}>
                        <div className={`max-w-[85%] border p-3 ${msg.role === 'user' || msg.isUser ? 'bg-primary/10 border-primary/30' : 'bg-card-dark border-border-dark'}`}>
                          <p className="text-sm text-white leading-relaxed whitespace-pre-wrap">{msg.content || msg.text}</p>
                        </div>
                      </div>
                    ))}
                  </div>
                </section>
              )}

              {/* Follow Up */}
              {(provider === 'jules' || provider === 'cursor') && (
                <section className="mt-6 pt-4 border-t border-border-dark">
                  <textarea
                    value={message}
                    onChange={(e) => setMessage(e.target.value)}
                    className="w-full bg-white dark:bg-sidebar-dark border border-slate-200 dark:border-border-dark text-slate-800 dark:text-slate-300 text-sm p-3 rounded-lg focus:ring-2 focus:ring-primary/20 focus:border-primary focus:outline-none transition-all duration-200 h-24 resize-none"
                    placeholder="Type instructions to continue task..."
                  />
                  <div className="flex justify-end mt-2">
                    <button
                      onClick={handleSendMessage}
                      disabled={sending}
                      className="bg-primary text-black px-4 py-2 text-xs font-semibold rounded-lg shadow-sm hover:shadow-md hover:brightness-110 active:scale-[0.98] disabled:opacity-50 disabled:cursor-not-allowed transition-all duration-200 flex items-center gap-2"
                    >
                      {sending && <span className="material-symbols-outlined text-sm animate-spin">sync</span>}
                      SEND
                    </button>
                  </div>
                </section>
              )}
            </>
          )}
        </div>
      </div>
    </div>
  );
};

export default AgentDetailModal;
