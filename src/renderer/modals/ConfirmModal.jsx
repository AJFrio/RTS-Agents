import React from 'react';
import Modal from '../components/ui/Modal.jsx';
import Button from '../components/ui/Button.jsx';
import { IconAlert } from '../components/ui/icons.jsx';

export default function ConfirmModal({ config, onClose }) {
  const open = !!config;
  const title = config?.title ?? 'Confirm';
  const message = config?.message ?? 'Are you sure?';
  const onConfirm = () => {
    config?.onConfirm?.();
    onClose();
  };
  if (!open) return null;
  return (
    <Modal open={open} onClose={onClose} size="sm">
      <div className="flex flex-col items-center p-5 text-center">
        <IconAlert size={22} className="mb-3 text-amber-600 dark:text-amber-400" />
        <h3 className="mb-1.5 text-[15px] font-semibold text-neutral-900 dark:text-neutral-100">
          {title}
        </h3>
        <p className="mb-5 text-[13px] text-neutral-500 dark:text-neutral-400">{message}</p>
        <div className="flex w-full gap-2">
          <Button variant="secondary" className="flex-1" onClick={onClose}>
            CANCEL
          </Button>
          <Button variant="primary" className="flex-1" onClick={onConfirm}>
            CONFIRM
          </Button>
        </div>
      </div>
    </Modal>
  );
}
