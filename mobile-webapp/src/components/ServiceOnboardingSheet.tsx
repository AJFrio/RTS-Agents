import { useEffect, useMemo, useState } from 'react';
import { MOBILE_SERVICE_CATALOG, type MobileServiceId } from './mobile-service-catalog';

function getInitialValues(serviceId: MobileServiceId, jiraBaseUrl: string): Record<string, string> {
  if (serviceId === 'jira') {
    return { baseUrl: jiraBaseUrl || '', apiKey: '' };
  }
  if (serviceId === 'cloudflare') {
    return { accountId: '', apiToken: '' };
  }
  return { apiKey: '' };
}

interface ServiceOnboardingSheetProps {
  open: boolean;
  initialServiceId: MobileServiceId | null;
  requiredConnection: boolean;
  hasConnectedServices: boolean;
  jiraBaseUrl: string;
  onClose: () => void;
  onConnect: (serviceId: MobileServiceId, values: Record<string, string>) => Promise<{ success: boolean; error?: string }>;
  onDisconnect: (serviceId: MobileServiceId) => void;
}

export default function ServiceOnboardingSheet({
  open,
  initialServiceId,
  requiredConnection,
  hasConnectedServices,
  jiraBaseUrl,
  onClose,
  onConnect,
  onDisconnect,
}: ServiceOnboardingSheetProps) {
  const [activeServiceId, setActiveServiceId] = useState<MobileServiceId>(initialServiceId || 'jules');
  const [formValues, setFormValues] = useState<Record<string, string>>({});
  const [busy, setBusy] = useState(false);
  const [feedback, setFeedback] = useState<{ type: 'success' | 'error'; message: string } | null>(null);

  useEffect(() => {
    if (!open) return;
    setActiveServiceId(initialServiceId || 'jules');
  }, [initialServiceId, open]);

  useEffect(() => {
    setFormValues(getInitialValues(activeServiceId, jiraBaseUrl));
    setFeedback(null);
  }, [activeServiceId, jiraBaseUrl]);

  const activeService = useMemo(
    () => MOBILE_SERVICE_CATALOG.find((service) => service.id === activeServiceId) || MOBILE_SERVICE_CATALOG[0],
    [activeServiceId]
  );

  const closeBlocked = requiredConnection && !hasConnectedServices;

  if (!open) return null;

  return (
    <div className="fixed inset-0 z-50 bg-slate-950/80 backdrop-blur-sm">
      <div className="absolute inset-x-0 bottom-0 top-10 bg-white dark:bg-slate-950 rounded-t-[2rem] shadow-2xl overflow-hidden flex flex-col">
        <div className="flex items-center justify-between px-5 py-4 border-b border-slate-200 dark:border-border-dark">
          <div>
            <h2 className="text-lg font-bold text-slate-900 dark:text-white">Service Onboarding</h2>
            <p className="text-xs text-slate-500 dark:text-slate-400">Verify each connection before leaving setup.</p>
          </div>
          <button
            type="button"
            onClick={onClose}
            disabled={closeBlocked}
            className="w-10 h-10 rounded-full border border-slate-200 dark:border-border-dark flex items-center justify-center text-slate-500 disabled:opacity-40"
          >
            <span className="material-symbols-outlined">close</span>
          </button>
        </div>

        <div className="px-4 py-4 overflow-y-auto space-y-6">
          <div className="flex gap-2 overflow-x-auto pb-1">
            {MOBILE_SERVICE_CATALOG.map((service) => {
              const selected = service.id === activeServiceId;
              return (
                <button
                  key={service.id}
                  type="button"
                  onClick={() => setActiveServiceId(service.id)}
                  className={`shrink-0 rounded-2xl border px-4 py-3 text-left min-w-[150px] ${
                    selected
                      ? 'border-primary bg-primary/10'
                      : 'border-slate-200 dark:border-border-dark bg-slate-50 dark:bg-slate-900'
                  }`}
                >
                  <div className="flex items-center gap-2">
                    <span className="material-symbols-outlined text-primary text-base">{service.icon}</span>
                    <div>
                      <div className="text-sm font-semibold text-slate-900 dark:text-white">{service.title}</div>
                      <div className="text-[11px] text-slate-500 dark:text-slate-400">{service.subtitle}</div>
                    </div>
                  </div>
                </button>
              );
            })}
          </div>

          <div className="space-y-4">
            <div>
              <h3 className="text-xl font-bold text-slate-900 dark:text-white">{activeService.title}</h3>
              <p className="text-sm text-slate-600 dark:text-slate-300 mt-1 leading-6">{activeService.description}</p>
            </div>

            {activeService.fields.map((field) => (
              <div key={field.key} className="space-y-2">
                <label className="block text-[11px] font-semibold uppercase tracking-[0.18em] text-slate-400">
                  {field.label}
                </label>
                <input
                  type={field.type}
                  value={formValues[field.key] || ''}
                  onChange={(event) => setFormValues((prev) => ({ ...prev, [field.key]: event.target.value }))}
                  placeholder={field.placeholder}
                  className="w-full bg-slate-50 dark:bg-black/40 border border-slate-200 dark:border-border-dark rounded-2xl px-4 py-3 text-sm text-slate-900 dark:text-white"
                />
              </div>
            ))}

            {feedback && (
              <div
                className={`rounded-2xl border px-4 py-3 text-sm ${
                  feedback.type === 'success'
                    ? 'border-emerald-200 bg-emerald-50 text-emerald-700 dark:border-emerald-900/60 dark:bg-emerald-950/20 dark:text-emerald-300'
                    : 'border-red-200 bg-red-50 text-red-700 dark:border-red-900/60 dark:bg-red-950/20 dark:text-red-300'
                }`}
              >
                {feedback.message}
              </div>
            )}
          </div>
        </div>

        <div className="border-t border-slate-200 dark:border-border-dark px-4 py-4 space-y-3">
          <div className="text-xs text-slate-500 dark:text-slate-400">
            {closeBlocked ? 'Connect at least one service to finish onboarding.' : 'Connected services will remain visible in settings.'}
          </div>
          <div className="flex gap-3">
            <button
              type="button"
              onClick={() => onDisconnect(activeService.id)}
              className="flex-1 border border-red-900/50 text-red-400 py-3 rounded-2xl text-sm font-semibold"
            >
              Disconnect
            </button>
            <button
              type="button"
              onClick={async () => {
                setBusy(true);
                setFeedback(null);
                try {
                  const result = await onConnect(activeService.id, formValues);
                  if (result.success) {
                    setFeedback({ type: 'success', message: `${activeService.title} connected successfully.` });
                  } else {
                    setFeedback({ type: 'error', message: result.error || 'Verification failed.' });
                  }
                } finally {
                  setBusy(false);
                }
              }}
              disabled={busy}
              className="flex-[1.4] bg-primary text-black py-3 rounded-2xl text-sm font-semibold disabled:opacity-50"
            >
              {busy ? 'VERIFYING...' : 'VERIFY & CONNECT'}
            </button>
          </div>
        </div>
      </div>
    </div>
  );
}
