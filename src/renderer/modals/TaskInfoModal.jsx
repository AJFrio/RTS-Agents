import React from 'react';
import Modal from '../components/ui/Modal.jsx';
import Button from '../components/ui/Button.jsx';
import { parseMarkdown } from '../utils/markdown.js';
import { IconClose } from '../components/ui/icons.jsx';
import DOMPurify from 'dompurify';

export default function TaskInfoModal({ task, onClose, onBuild }) {
  if (!task) return null;

  return (
    <Modal open={!!task} onClose={onClose} size="md">
      <div className="flex max-h-[85vh] flex-col">
        <div className="flex shrink-0 items-start justify-between gap-3 border-b border-border-light px-4 py-3 dark:border-border-dark">
          <h2 className="flex-1 text-[15px] font-semibold leading-snug text-neutral-900 dark:text-neutral-100">
            {task.title}
          </h2>
          <button
            type="button"
            onClick={onClose}
            aria-label="Close task details"
            className="rounded-md p-1.5 text-neutral-500 transition-colors hover:bg-neutral-100 hover:text-neutral-900 dark:hover:bg-neutral-800 dark:hover:text-neutral-100"
          >
            <IconClose size={16} />
          </button>
        </div>

        <div className="max-h-[70vh] flex-1 overflow-y-auto p-4">
          <div className="prose prose-sm max-w-none leading-relaxed text-neutral-600 dark:prose-invert dark:text-neutral-300">
            <div dangerouslySetInnerHTML={{ __html: DOMPurify.sanitize(parseMarkdown(task.description)) }} />
          </div>
        </div>

        <div className="flex shrink-0 items-center justify-end gap-2 border-t border-border-light px-4 py-3 dark:border-border-dark">
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
