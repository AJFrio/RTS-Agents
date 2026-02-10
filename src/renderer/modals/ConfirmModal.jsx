import React from 'react';
import Modal from '../components/ui/Modal.jsx';
import Button from '../components/ui/Button.jsx';

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
    <Modal open={open} onClose={onClose}>
      <div className="bg-sidebar-dark border border-border-dark w-full max-w-md p-6 shadow-2xl flex flex-col items-center text-center rounded-xl">
        <span className="material-symbols-outlined text-primary text-4xl mb-4">warning</span>
        <h3 className="text-lg font-bold text-white uppercase tracking-tight mb-2">{title}</h3>
        <p className="text-sm text-slate-400 mb-6 font-light">{message}</p>
        <div className="flex gap-3 w-full">
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
