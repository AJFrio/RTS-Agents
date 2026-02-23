import React from 'react';
import Modal from '../components/ui/Modal.jsx';
import Button from '../components/ui/Button.jsx';
import { parseMarkdown } from '../utils/markdown.js';

export default function TaskInfoModal({ task, onClose, onBuild }) {
  if (!task) return null;

  return (
    <Modal open={!!task} onClose={onClose}>
      <div className="bg-white dark:bg-sidebar-dark border border-slate-200 dark:border-border-dark w-full max-w-2xl overflow-hidden flex flex-col shadow-2xl rounded-2xl">
        <div className="p-6 border-b border-slate-200 dark:border-border-dark flex justify-between items-start bg-white dark:bg-black/40">
          <h2 className="text-xl font-display font-bold text-slate-900 dark:text-white tracking-tight leading-tight flex-1 mr-4">
            {task.title}
          </h2>
          <button
            type="button"
            onClick={onClose}
            className="text-slate-500 hover:text-slate-700 dark:hover:text-primary transition-colors"
          >
            <span className="material-symbols-outlined">close</span>
          </button>
        </div>

        <div className="flex-1 overflow-y-auto p-6 bg-white dark:bg-background-dark max-h-[70vh]">
          <div className="prose dark:prose-invert prose-sm max-w-none text-slate-600 dark:text-slate-300 font-light leading-relaxed">
            <div dangerouslySetInnerHTML={{ __html: parseMarkdown(task.description) }} />
          </div>
        </div>

        <div className="p-4 bg-slate-50 dark:bg-black border-t border-slate-200 dark:border-border-dark flex justify-end gap-2">
          <Button variant="secondary" onClick={onClose}>
            Close
          </Button>
          <Button variant="primary" onClick={() => onBuild(task)}>
            Build Task
          </Button>
        </div>
      </div>
    </Modal>
  );
}
