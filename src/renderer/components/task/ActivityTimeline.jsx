import React, { useCallback, useEffect, useRef, useState } from 'react';
import Collapsible from '../ui/Collapsible.jsx';
import PastedImageModal from '../../modals/PastedImageModal.jsx';

function getActivityTypeLabel(type) {
  if (!type) return 'Activity';
  return type
    .split('_')
    .map((w) => w.charAt(0).toUpperCase() + w.slice(1).toLowerCase())
    .join(' ');
}

function formatActivityTime(timestamp) {
  if (!timestamp) return null;
  const date = new Date(timestamp);
  if (Number.isNaN(date.getTime())) return null;
  return date.toLocaleString();
}

function ActivityMediaLazy({ sessionId, activity, api, scrollRootRef }) {
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
        <div className="rounded-lg border border-dashed border-slate-200 dark:border-border-dark bg-slate-50 dark:bg-slate-900/50 px-3 py-4 text-xs text-slate-500">
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
              className="overflow-hidden rounded-lg border border-slate-200 dark:border-border-dark bg-slate-50 dark:bg-black/30"
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
                    className="max-h-80 w-full object-contain bg-black cursor-zoom-in"
                  />
                </button>
              )}
            </div>
          ))}
        </div>
      )}
      {!loading && !error && mediaItems?.length === 0 && fetchedRef.current && (
        <p className="text-xs text-slate-500">No verification media available.</p>
      )}
      <PastedImageModal imageUrl={lightboxUrl} onClose={() => setLightboxUrl(null)} />
    </div>
  );
}

export default function ActivityTimeline({
  activities,
  renderMessage,
  showMedia = false,
  mediaApi,
  mediaSessionId,
  scrollRootRef,
  expandedIds,
  onToggleRow,
}) {
  if (!activities?.length) return null;

  return (
    <div className="space-y-4">
      {activities.map((activity) => {
        const rowId = activity.id;
        const time = formatActivityTime(activity.timestamp);
        const counts = [];
        if (activity.commands?.length > 0) counts.push(`${activity.commands.length} cmd(s)`);
        if (activity.fileChanges?.length > 0) counts.push(`${activity.fileChanges.length} file(s)`);

        return (
          <div
            key={rowId}
            className="relative border-l-2 border-slate-200 py-1 pl-4 dark:border-border-dark"
          >
            <span
              aria-hidden="true"
              className="absolute -left-[5px] top-2.5 h-2 w-2 rounded-full bg-primary"
            />
            <Collapsible
              variant="plain"
              mountWhenClosed={false}
              open={expandedIds ? expandedIds.has(rowId) : undefined}
              onToggle={onToggleRow ? (next) => onToggleRow(rowId, next) : undefined}
              label={
                <span className="flex min-w-0 items-center gap-2">
                  <span className="rounded-full bg-primary/10 px-2 py-0.5 text-[10px] font-semibold uppercase tracking-wide text-primary dark:bg-primary/20">
                    {getActivityTypeLabel(activity.type)}
                  </span>
                  {activity.title && (
                    <span
                      title={activity.title}
                      className="min-w-0 flex-1 truncate text-sm font-medium text-slate-800 dark:text-slate-200"
                    >
                      {activity.title}
                    </span>
                  )}
                </span>
              }
              meta={
                <span className="flex items-center gap-2 text-[10px] technical-font text-slate-500">
                  {counts.length > 0 && <span>{counts.join(' · ')}</span>}
                  {activity.originator && activity.originator !== 'system' && (
                    <span className="font-sans">({activity.originator})</span>
                  )}
                  {time && <span>{time}</span>}
                </span>
              }
            >
              {activity.description && (
                <p className="text-xs text-slate-600 dark:text-slate-400">{activity.description}</p>
              )}
              {activity.message && renderMessage(activity.message)}
              {activity.planSteps?.length > 0 && (
                <ul className="mt-2 space-y-1 text-xs text-slate-600 dark:text-slate-400">
                  {activity.planSteps.map((step, i) => (
                    <li key={i}>
                      <span className="font-medium">{step.title}</span>
                      {step.description && ` — ${step.description}`}
                    </li>
                  ))}
                </ul>
              )}
              {showMedia && mediaSessionId && (
                <ActivityMediaLazy
                  sessionId={mediaSessionId}
                  activity={activity}
                  api={mediaApi}
                  scrollRootRef={scrollRootRef}
                />
              )}
            </Collapsible>
          </div>
        );
      })}
    </div>
  );
}
