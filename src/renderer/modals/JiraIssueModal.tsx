import React, { useEffect, useState } from 'react';
import { useApp } from '../context/AppContext';

const JiraIssueModal: React.FC = () => {
  const { modals, closeModal } = useApp();
  const { open, issueKey } = modals.jiraIssue;
  const [issue, setIssue] = useState<any>(null);
  const [comments, setComments] = useState<any[]>([]);
  const [loading, setLoading] = useState(false);

  useEffect(() => {
    if (open && issueKey) {
      loadIssue();
    }
  }, [open, issueKey]);

  const loadIssue = async () => {
    if (!window.electronAPI || !issueKey) return;
    setLoading(true);
    try {
      const [issueRes, commentsRes] = await Promise.all([
        window.electronAPI.jira.getIssue(issueKey),
        window.electronAPI.jira.getIssueComments(issueKey)
      ]);

      if (issueRes.success) setIssue(issueRes.issue);
      if (commentsRes.success) setComments(commentsRes.comments || []);
    } catch (err) {
      console.error(err);
    } finally {
      setLoading(false);
    }
  };

  if (!open) return null;

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-4">
      <div className="fixed inset-0 bg-black/80 backdrop-blur-sm" onClick={() => closeModal('jiraIssue')}></div>

      <div className="relative bg-sidebar-dark border border-border-dark w-full max-w-4xl max-h-[90vh] overflow-hidden flex flex-col shadow-2xl">
        <div className="p-6 border-b border-border-dark flex justify-between items-start bg-black/40">
          <div className="flex-1 mr-8">
            {loading ? <p className="text-slate-500">Loading...</p> : issue ? (
              <>
                <div className="flex items-center gap-3 mb-2">
                   <span className="text-primary technical-font text-sm font-bold">{issue.key}</span>
                   <span className="px-2 py-0.5 text-[10px] technical-font font-bold bg-slate-700 text-slate-200">{issue.fields?.status?.name?.toUpperCase()}</span>
                </div>
                <h2 className="text-xl font-display font-bold text-white tracking-tight leading-tight">{issue.fields?.summary}</h2>
              </>
            ) : null}
          </div>
          <button onClick={() => closeModal('jiraIssue')} className="text-slate-500 hover:text-primary transition-colors">
            <span className="material-symbols-outlined">close</span>
          </button>
        </div>

        <div className="flex-1 overflow-y-auto p-8 bg-background-dark">
          {issue && (
            <>
              {/* Description etc would go here - keeping it simple for now */}
              <div className="mb-6">
                <h3 className="text-[11px] technical-font text-slate-500 font-bold mb-3 border-b border-border-dark pb-2">COMMENTS ({comments.length})</h3>
                <div className="space-y-4">
                  {comments.map((comment: any) => (
                    <div key={comment.id} className="bg-card-dark border border-border-dark p-4">
                      <div className="flex items-center justify-between mb-2">
                        <span className="text-xs technical-font text-slate-300 font-bold">{comment.author?.displayName}</span>
                        <span className="text-[10px] technical-font text-slate-500">{new Date(comment.created).toLocaleString()}</span>
                      </div>
                      <div className="text-sm text-slate-300 font-light leading-relaxed whitespace-pre-wrap mt-2">{comment.body}</div>
                    </div>
                  ))}
                </div>
              </div>
            </>
          )}
        </div>
      </div>
    </div>
  );
};

export default JiraIssueModal;
