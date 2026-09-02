import React, { useCallback, useEffect, useRef, useState } from 'react';
import PastedImageModal from '../../modals/PastedImageModal.jsx';

/**
 * Lazy-loaded Jules verification media. IntersectionObserver +
 * getJulesActivityMedia so captures load only when the turn is on screen.
 */
export default function JulesActivityMedia({ sessionId, activity, api, scrollRootRef }) {
  const containerRef = useRef(null);
  const [mediaItems, setMediaItems] = useState(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState(null);
  const [lightboxUrl, setLightboxUrl] = useState(null);
  const fetchedRef = useRef(false);

  const loadMedia = useCallback(() => {
    if (fetchedRef.current || !api?.getJulesActivityMedia || !sessionId || !activity?.id) return;
    fetchedRef.current = true;
    setLoading(true);
    setError(null);
    api
      .getJulesActivityMedia(sessionId, activity.id)
      .then((result) => {
        setMediaItems(result?.mediaItems ?? []);
      })
      .catch((err) => {
        console.error(err);
        setError(err?.message || 'Failed to load verification media');
      })
      .finally(() => setLoading(false));
  }, [api, sessionId, activity?.id]);

  useEffect(() => {
    fetchedRef.current = false;
    setMediaItems(null);
    setError(null);
    setLoading(false);
  }, [sessionId, activity?.id]);

  useEffect(() => {
    if (!activity?.hasMedia) return undefined;
    const target = containerRef.current;
    if (!target) return undefined;

    const root = scrollRootRef?.current ?? null;
    const observer = new IntersectionObserver(
      (entries) => {
        if (entries.some((entry) => entry.isIntersecting)) {
          loadMedia();
          observer.disconnect();
        }
      },
      { root, rootMargin: '120px', threshold: 0.01 }
    );

    observer.observe(target);
    return () => observer.disconnect();
  }, [activity?.hasMedia, activity?.id, loadMedia, scrollRootRef]);

  if (!activity?.hasMedia) return null;

  return (
    <div ref={containerRef} className="mt-3 space-y-2">
      {loading && (
        <div className="rounded-lg border border-dashed border-border-strong-light bg-inset-light px-3 py-4 text-xs text-neutral-500 dark:border-border-strong-dark dark:bg-inset-dark">
          Loading verification capture…
        </div>
      )}
      {error && !loading && (
        <p className="text-xs text-red-600 dark:text-red-400">{error}</p>
      )}
      {mediaItems?.length > 0 && (
        <div
          className={`grid gap-2 ${mediaItems.length > 1 ? 'grid-cols-1 sm:grid-cols-2' : 'grid-cols-1'}`}
        >
          {mediaItems.map((item, index) => (
            <div
              key={`${item.mimeType}-${index}`}
              className="overflow-hidden rounded-lg border border-border-light bg-inset-light dark:border-border-dark dark:bg-black/30"
            >
              {item.kind === 'video' ? (
                <video
                  src={item.dataUrl}
                  controls
                  preload="metadata"
                  className="max-h-80 w-full bg-black"
                />
              ) : (
                <button
                  type="button"
                  onClick={() => setLightboxUrl(item.dataUrl)}
                  className="block w-full text-left"
                >
                  <img
                    src={item.dataUrl}
                    alt="UI verification capture"
                    loading="lazy"
                    className="max-h-80 w-full cursor-zoom-in bg-black object-contain"
                  />
                </button>
              )}
            </div>
          ))}
        </div>
      )}
      {!loading && !error && mediaItems?.length === 0 && fetchedRef.current && (
        <p className="text-xs text-neutral-500">No verification media available.</p>
      )}
      <PastedImageModal imageUrl={lightboxUrl} onClose={() => setLightboxUrl(null)} />
    </div>
  );
}
