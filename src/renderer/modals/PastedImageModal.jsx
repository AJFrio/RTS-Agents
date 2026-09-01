import React from 'react';
import Modal from '../components/ui/Modal.jsx';
import { IconClose } from '../components/ui/icons.jsx';

export default function PastedImageModal({ imageUrl, onClose }) {
  if (!imageUrl) return null;
  return (
    <Modal open={!!imageUrl} onClose={onClose} className="w-full max-w-5xl">
      <div className="relative">
        <button
          type="button"
          onClick={onClose}
          aria-label="Close image preview"
          className="absolute right-3 top-3 z-10 rounded-md bg-black/60 p-1.5 text-white transition-colors hover:bg-black/80"
        >
          <IconClose size={16} />
        </button>
        <div className="p-3">
          <img
            id="pasted-image-modal-img"
            src={imageUrl}
            alt="Pasted image preview"
            className="max-h-[80vh] w-full border border-border-light object-contain bg-black dark:border-border-dark"
          />
        </div>
      </div>
    </Modal>
  );
}
