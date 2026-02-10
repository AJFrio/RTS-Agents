import React, { useState, useEffect } from 'react';
import Modal from '../components/ui/Modal.jsx';
import Button from '../components/ui/Button.jsx';
import { useApp } from '../context/AppContext.jsx';

export default function PrModal({ pr, onClose, api }) {
  const { loadAgents, removePr } = useApp();
  const [details, setDetails] = useState(null);
  const [merging, setMerging] = useState(false);

  const owner = pr?.base?.repo?.owner?.login || pr?.head?.repo?.owner?.login;
  const repoName = pr?.base?.repo?.name || pr?.head?.repo?.name;
  const prNumber = pr?.number;

  useEffect(() => {
    if (!pr || !api?.github?.getPrDetails || !owner || !repoName) return;
    api.github
      .getPrDetails(owner, repoName, prNumber)
      .then((res) => res?.pr && setDetails(res.pr))
      .catch(console.error);
  }, [pr?.id, owner, repoName, prNumber, api]);

  const data = details || pr;
  const mergeable = data?.mergeable === true;
  const merged = !!data?.merged_at;
  const state = data?.state || 'open';

  const handleMerge = async () => {
    if (!api?.github?.mergePr || !owner || !repoName) return;
    setMerging(true);
    try {
      await api.github.mergePr(owner, repoName, prNumber, 'merge');
      removePr(pr.id);
      onClose();
      loadAgents();
    } finally {
      setMerging(false);
    }
  };

  const handleClosePr = async () => {
    if (!api?.github?.closePr || !owner || !repoName) return;
    setMerging(true);
    try {
      await api.github.closePr(owner, repoName, prNumber);
      removePr(pr.id);
      onClose();
      loadAgents();
    } finally {
      setMerging(false);
    }
  };

  if (!pr) return null;

  return (
    <Modal open={!!pr} onClose={onClose}>
      <div className="bg-white dark:bg-sidebar-dark border border-slate-200 dark:border-border-dark w-full max-w-4xl max-h-[90vh] overflow-hidden flex flex-col shadow-2xl rounded-2xl">
        <div className="p-6 border-b border-slate-200 dark:border-border-dark flex justify-between items-start bg-white dark:bg-black/40">
          <div className="flex-1 mr-8">
            <div className="flex items-center gap-3 mb-2">
              <span id="pr-modal-number" className="text-slate-500 technical-font text-sm">#{pr.number}</span>
              <span
                id="pr-modal-state"
                className={`px-2 py-0.5 text-[10px] technical-font font-bold ${
                  state === 'open'
                    ? 'bg-emerald-500/20 text-emerald-500'
                    : 'bg-slate-200 dark:bg-slate-700 text-slate-700 dark:text-slate-300'
                }`}
              >
                {state.toUpperCase()}
              </span>
            </div>
            <h2 id="pr-modal-title" className="text-xl font-display font-bold text-slate-900 dark:text-white tracking-tight leading-tight">
              {data?.title || 'Loading...'}
            </h2>
          </div>
          <button type="button" onClick={onClose} className="text-slate-500 hover:text-slate-700 dark:hover:text-primary transition-colors">
            <span className="material-symbols-outlined">close</span>
          </button>
        </div>
        <div className="flex-1 overflow-y-auto p-8 bg-white dark:bg-background-dark">
          <div className="grid grid-cols-2 gap-4 mb-8">
            <div className="bg-slate-50 dark:bg-[#1A1A1A] border border-slate-200 dark:border-border-dark p-4">
              <div className="text-[9px] technical-font text-slate-500 mb-1">SOURCE</div>
              <div id="pr-modal-head" className="text-xs font-mono text-primary">{data?.head?.ref ?? '—'}</div>
            </div>
            <div className="bg-slate-50 dark:bg-[#1A1A1A] border border-slate-200 dark:border-border-dark p-4">
              <div className="text-[9px] technical-font text-slate-500 mb-1">TARGET</div>
              <div id="pr-modal-base" className="text-xs font-mono text-slate-600 dark:text-slate-300">{data?.base?.ref ?? '—'}</div>
            </div>
          </div>
          <div className="mb-8">
            <h3 className="text-[11px] technical-font text-slate-500 font-bold mb-3 border-b border-slate-200 dark:border-border-dark pb-2">DESCRIPTION</h3>
            <div
              id="pr-modal-body"
              className="prose dark:prose-invert prose-sm max-w-none text-slate-600 dark:text-slate-300 font-light leading-relaxed"
              dangerouslySetInnerHTML={{ __html: data?.body ? data.body.replace(/\n/g, '<br/>') : '—' }}
            />
          </div>
          <div className="bg-slate-50 dark:bg-[#1A1A1A] border border-slate-200 dark:border-border-dark p-4 flex items-center justify-between">
            <div className="flex items-center gap-3">
              <span className={`material-symbols-outlined ${mergeable ? 'text-emerald-500' : 'text-yellow-500'}`}>
                {mergeable ? 'check_circle' : 'warning'}
              </span>
              <div>
                <div className="text-sm font-bold text-slate-900 dark:text-white">
                  {mergeable ? 'This branch has no conflicts with the base branch' : 'Merge status may vary'}
                </div>
                <div className="text-xs text-slate-500">Merging can be performed automatically.</div>
              </div>
            </div>
            <div className="flex items-center gap-2">
              {state === 'open' && (
                <>
                  <Button variant="secondary" onClick={() => api?.openExternal?.(data?.html_url)}>
                    <span className="material-symbols-outlined text-sm">open_in_new</span>
                    GITHUB
                  </Button>
                  <Button variant="danger" onClick={handleClosePr} disabled={merging}>
                    CLOSE PR
                  </Button>
                  <Button variant="primary" onClick={handleMerge} disabled={!mergeable || merging}>
                    <span className="material-symbols-outlined text-sm">merge</span>
                    MERGE
                  </Button>
                </>
              )}
            </div>
          </div>
        </div>
        <div className="p-4 bg-slate-50 dark:bg-black border-t border-slate-200 dark:border-border-dark flex justify-between items-center text-[10px] technical-font">
          <a
            id="pr-modal-link"
            href={data?.html_url}
            target="_blank"
            rel="noopener noreferrer"
            className="text-slate-500 hover:text-primary flex items-center gap-1"
            onClick={(e) => {
              e.preventDefault();
              api?.openExternal?.(data?.html_url);
            }}
          >
            <span className="material-symbols-outlined text-xs">open_in_new</span>
            OPEN IN BROWSER
          </a>
          <span id="pr-modal-meta" className="text-slate-600">Updated {data?.updated_at ?? ''}</span>
        </div>
      </div>
    </Modal>
  );
}
