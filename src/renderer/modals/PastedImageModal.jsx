import React from 'react';
import Modal from '../components/ui/Modal.jsx';

export default function PastedImageModal({ imageUrl, onClose }) {
  if (!imageUrl) return null;
  return (
    <Modal open={!!imageUrl} onClose={onClose}>
      <div className="bg-sidebar-dark border border-border-dark w-full max-w-5xl max-h-[90vh] overflow-hidden">
        <button
          type="button"
          onClick={onClose}
          className="absolute top-3 right-3 text-slate-500 hover:text-primary transition-colors z-10"
        >
          <span className="material-symbols-outlined text-2xl">close</span>
        </button>
        <div className="p-4">
          <img
            id="pasted-image-modal-img"
            src={imageUrl}
            alt="Pasted image preview"
            className="w-full max-h-[80vh] object-contain bg-black border border-border-dark"
          />
        </div>
      </div>
    </Modal>
  );
}
