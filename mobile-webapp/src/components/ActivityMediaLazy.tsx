/**
 * Lazy-load Jules UI verification media when the activity row is visible.
 */

import { useCallback, useEffect, useRef, useState, type RefObject } from 'react';
import type { Activity, ActivityMediaItem } from '../store/types';
import { julesService } from '../services/jules-service';

interface ActivityMediaLazyProps {
  sessionId: string;
  activity: Activity;
  scrollRootRef?: RefObject<HTMLElement | null>;
}

export default function ActivityMediaLazy({ sessionId, activity, scrollRootRef }: ActivityMediaLazyProps) {
  const containerRef = useRef<HTMLDivElement>(null);
  const [mediaItems, setMediaItems] = useState<ActivityMediaItem[] | null>(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const fetchedRef = useRef(false);

  const loadMedia = useCallback(() => {
    if (fetchedRef.current || !sessionId || !activity?.id) return;
    fetchedRef.current = true;
    setLoading(true);
    setError(null);
    julesService
      .getActivityMedia(sessionId, activity.id)
      .then((result) => {
        setMediaItems(result.mediaItems ?? []);
      })
      .catch((err) => {
        console.error(err);
        setError(err instanceof Error ? err.message : 'Failed to load verification media');
      })
      .finally(() => setLoading(false));
  }, [sessionId, activity?.id]);

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
        <div className="rounded-lg border border-dashed border-slate-200 dark:border-border-dark bg-slate-50 dark:bg-slate-900/50 px-3 py-4 text-xs text-slate-500">
          Loading verification capture…
        </div>
      )}
      {error && !loading && <p className="text-xs text-red-500">{error}</p>}
      {mediaItems && mediaItems.length > 0 && (
        <div className="grid grid-cols-1 gap-2">
          {mediaItems.map((item, index) => (
            <div
              key={`${item.mimeType}-${index}`}
              className="overflow-hidden rounded-lg border border-slate-200 dark:border-border-dark bg-slate-50 dark:bg-black/30"
            >
              {item.kind === 'video' ? (
                <video
                  src={item.dataUrl}
                  controls
                  preload="metadata"
                  className="max-h-64 w-full bg-black"
                />
              ) : (
                <img
                  src={item.dataUrl}
                  alt="UI verification capture"
                  loading="lazy"
                  className="max-h-64 w-full object-contain bg-black"
                />
              )}
            </div>
          ))}
        </div>
      )}
      {!loading && !error && mediaItems?.length === 0 && fetchedRef.current && (
        <p className="text-xs text-slate-500">No verification media available.</p>
      )}
    </div>
  );
}
