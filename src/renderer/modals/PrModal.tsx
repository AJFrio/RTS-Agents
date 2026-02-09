import React, { useEffect, useState } from 'react';
import { useApp } from '../context/AppContext';
import { marked } from 'marked';
import DOMPurify from 'dompurify';

const PrModal: React.FC = () => {
  const { modals, closeModal, selectRepo, github } = useApp();
  const { open, owner, repo, number } = modals.pr;
  const [pr, setPr] = useState<any>(null);
  const [loading, setLoading] = useState(false);
  const [actionLoading, setActionLoading] = useState(false);

  useEffect(() => {
    if (open && owner && repo && number) {
      loadPr();
    }
  }, [open, owner, repo, number]);

  const loadPr = async () => {
    if (!window.electronAPI || !owner || !repo || !number) return;
    setLoading(true);
    try {
      const result = await window.electronAPI.github.getPrDetails(owner, repo, number);
      if (result.success) {
        setPr(result.pr);
      }
    } catch (err) {
      console.error(err);
    } finally {
      setLoading(false);
    }
  };

  const handleAction = async (action: 'merge' | 'close') => {
    if (!window.electronAPI || !owner || !repo || !number) return;
    setActionLoading(true);
    try {
      if (action === 'merge') {
        await window.electronAPI.github.mergePr(owner, repo, number);
      } else {
        await window.electronAPI.github.closePr(owner, repo, number);
      }
      closeModal('pr');
      // Refresh PRs
      if (github.selectedRepo) {
        selectRepo(github.selectedRepo.id);
      }
      alert(`PR ${action}d successfully`);
    } catch (err) {
      alert(`Failed: ${err}`);
    } finally {
      setActionLoading(false);
    }
  };

  if (!open) return null;

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-4">
      <div className="fixed inset-0 bg-black/80 backdrop-blur-sm" onClick={() => closeModal('pr')}></div>

      <div className="relative bg-sidebar-dark border border-border-dark w-full max-w-4xl max-h-[90vh] overflow-hidden flex flex-col shadow-2xl">
        <div className="p-6 border-b border-border-dark flex justify-between items-start bg-black/40">
          <div className="flex-1 mr-8">
            {loading ? <p className="text-slate-500">Loading...</p> : pr ? (
              <>
                <div className="flex items-center gap-3 mb-2">
                   <span className="text-slate-500 technical-font text-sm">#{pr.number}</span>
                   <span className="px-2 py-0.5 text-[10px] technical-font font-bold">{pr.state.toUpperCase()}</span>
                </div>
                <h2 className="text-xl font-display font-bold text-white tracking-tight leading-tight">{pr.title}</h2>
              </>
            ) : null}
          </div>
          <button onClick={() => closeModal('pr')} className="text-slate-500 hover:text-primary transition-colors">
            <span className="material-symbols-outlined">close</span>
          </button>
        </div>

        <div className="flex-1 overflow-y-auto p-8 bg-background-dark">
           {pr && (
             <>
               <div className="mb-8">
                  <h3 className="text-[11px] technical-font text-slate-500 font-bold mb-3 border-b border-border-dark pb-2">DESCRIPTION</h3>
                  <div className="prose prose-invert prose-sm max-w-none text-slate-300 font-light leading-relaxed"
                    dangerouslySetInnerHTML={{ __html: pr.body ? DOMPurify.sanitize(marked.parse(pr.body) as string) : 'No description' }}
                  />
               </div>

               <div className="bg-[#1A1A1A] border border-border-dark p-4 flex items-center justify-between">
                  <div className="flex items-center gap-3">
                     <span className={`material-symbols-outlined ${pr.mergeable ? 'text-emerald-500' : 'text-red-500'}`}>
                       {pr.mergeable ? 'check_circle' : 'error'}
                     </span>
                     <div>
                        <div className="text-sm font-bold text-white">{pr.mergeable ? 'This branch has no conflicts' : 'This branch has conflicts'}</div>
                     </div>
                  </div>
                  <div className="flex items-center gap-2">
                    {pr.state === 'open' && (
                      <>
                        <button
                          onClick={() => handleAction('close')}
                          disabled={actionLoading}
                          className="border border-red-500/50 text-red-500 px-4 py-2 text-xs font-semibold rounded-lg hover:bg-red-500/10 active:scale-[0.98] transition-all duration-200 flex items-center gap-2"
                        >
                           CLOSE
                        </button>
                        <button
                          onClick={() => handleAction('merge')}
                          disabled={!pr.mergeable || actionLoading}
                          className="bg-emerald-600 text-white px-6 py-2 text-xs font-semibold rounded-lg shadow-sm hover:shadow-md hover:brightness-110 active:scale-[0.98] disabled:opacity-50 disabled:cursor-not-allowed transition-all duration-200 flex items-center gap-2"
                        >
                           MERGE
                        </button>
                      </>
                    )}
                  </div>
               </div>
             </>
           )}
        </div>
      </div>
    </div>
  );
};

export default PrModal;
