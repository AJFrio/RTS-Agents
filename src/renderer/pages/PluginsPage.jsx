import React, { useCallback, useMemo, useState } from 'react';
import { useApp } from '../context/AppContext.jsx';
import ServiceOnboardingModal from '../components/settings/ServiceOnboardingModal.jsx';
import { SERVICE_CATALOG, getServiceDefinition } from '../components/settings/service-catalog.js';
import { buildConnectedServiceGroups } from '../components/settings/service-status.js';
import { useConnectedServices, buildConnectedServices } from '../components/settings/connected-services.js';
import { providerMeta, IconKey, IconExternal } from '../components/ui/icons.jsx';
import { StatusDot } from '../components/ui/status.jsx';

function getStatusMeta(status) {
  if (!status) {
    return { label: 'Pending', tone: 'idle' };
  }
  if (status.success || status.connected) {
    return { label: 'Connected', tone: 'completed' };
  }
  return { label: 'Attention', tone: 'failed' };
}

function ServiceCard({
  definition,
  connected,
  status,
  summary,
  disconnectable = false,
  onManage,
  onAdd,
  onDisconnect,
  busy,
  extraAction,
}) {
  const Icon = providerMeta(definition.provider).Icon;
  const statusInfo = getStatusMeta(status);

  return (
    <div className="flex flex-col rounded-lg border border-border-light bg-card-light p-4 transition-colors hover:border-border-strong-light dark:border-border-dark dark:bg-card-dark dark:hover:border-border-strong-dark">
      <div className="flex items-start gap-3">
        <span className="flex h-8 w-8 shrink-0 items-center justify-center rounded-sm border border-border-light bg-inset-light text-neutral-600 dark:border-border-dark dark:bg-inset-dark dark:text-neutral-300">
          <Icon size={15} />
        </span>
        <div className="min-w-0 flex-1">
          <div className="flex flex-wrap items-center gap-2">
            <h3 className="text-[13px] font-semibold text-neutral-900 dark:text-neutral-100">
              {definition.title}
            </h3>
            <span className="text-[11px] text-neutral-400 dark:text-neutral-500">
              {definition.subtitle}
            </span>
            {connected && (
              <span
                className={`inline-flex items-center gap-1.5 rounded-full px-2 py-0.5 text-[10px] font-medium ${
                  statusInfo.tone === 'completed'
                    ? 'bg-emerald-500/10 text-emerald-700 dark:text-emerald-400'
                    : statusInfo.tone === 'failed'
                      ? 'bg-red-500/10 text-red-700 dark:text-red-400'
                      : 'bg-neutral-400/10 text-neutral-500 dark:text-neutral-400'
                }`}
              >
                <StatusDot status={statusInfo.tone === 'completed' ? 'completed' : statusInfo.tone === 'failed' ? 'failed' : 'idle'} />
                {statusInfo.label}
              </span>
            )}
          </div>
          <p className="mt-1.5 text-[12px] leading-relaxed text-neutral-500 dark:text-neutral-400">
            {summary || definition.description}
          </p>
        </div>
      </div>

      <div className="mt-4 flex flex-wrap items-center gap-2">
        {connected ? (
          <>
            <button
              type="button"
              onClick={onManage}
              className="rounded-md border border-border-light px-2.5 py-1 text-[12px] font-medium text-neutral-700 transition-colors hover:bg-neutral-100 dark:border-border-dark dark:text-neutral-300 dark:hover:bg-neutral-800"
            >
              Manage
            </button>
            {disconnectable && (
              <button
                type="button"
                onClick={onDisconnect}
                disabled={busy}
                className="rounded-md border border-red-500/40 px-2.5 py-1 text-[12px] font-medium text-red-600 transition-colors hover:bg-red-500/10 disabled:opacity-50 dark:text-red-400"
              >
                {busy ? 'Disconnecting…' : 'Disconnect'}
              </button>
            )}
            {extraAction}
          </>
        ) : (
          <>
            <button
              type="button"
              onClick={onAdd}
              className="inline-flex items-center gap-1.5 rounded-md bg-neutral-900 px-2.5 py-1 text-[12px] font-medium text-white transition-colors hover:opacity-90 dark:bg-neutral-100 dark:text-neutral-900"
            >
              Add service
            </button>
            {extraAction}
          </>
        )}
      </div>
    </div>
  );
}

/**
 * Plugins tab: the service hub (replaces the Settings connected-services
 * card and the service onboarding entry point). Shows everything that is
 * connected plus the full catalog of services that can be added; clicking
 * an unconnected service opens a focused single-service setup modal.
 */
export default function PluginsPage() {
  const { state, api, loadSettings, checkConnectionStatus, setView } = useApp();
  const { disconnectServiceGroup } = useConnectedServices();
  const [onboardingOpen, setOnboardingOpen] = useState(false);
  const [activeServiceId, setActiveServiceId] = useState(null);
  const [busyServiceId, setBusyServiceId] = useState(null);

  const connectedServices = useMemo(() => buildConnectedServices(state), [state]);
  const connectedGroups = useMemo(
    () => buildConnectedServiceGroups(connectedServices, state),
    [connectedServices, state]
  );

  const openOnboarding = useCallback((serviceId) => {
    setActiveServiceId(serviceId);
    setOnboardingOpen(true);
  }, []);

  const handleDisconnect = useCallback(
    async (group) => {
      disconnectServiceGroup(group);
    },
    [disconnectServiceGroup]
  );

  const connectedCatalogIds = new Set(connectedGroups.flatMap((group) => group.services));
  const availableServices = SERVICE_CATALOG.filter((service) => !connectedCatalogIds.has(service.id));

  return (
    <div id="view-plugins" className="view-content mx-auto w-full max-w-5xl space-y-8">
      <section>
        <div className="mb-4">
          <h2 className="text-[15px] font-semibold text-neutral-900 dark:text-neutral-100">
            Your services
          </h2>
          <p className="mt-0.5 text-[12px] text-neutral-500 dark:text-neutral-400">
            Everything RTS is connected to right now.
          </p>
        </div>

        {connectedGroups.length === 0 ? (
          <div className="rounded-lg border border-dashed border-border-strong-light py-10 text-center dark:border-border-strong-dark">
            <IconKey size={20} className="mx-auto text-neutral-400" />
            <p className="mt-3 text-[13px] font-medium text-neutral-700 dark:text-neutral-300">
              No services connected yet
            </p>
            <p className="mt-1 text-[12px] text-neutral-400 dark:text-neutral-500">
              Add a harness or integration below to get started.
            </p>
          </div>
        ) : (
          <div className="grid gap-3 md:grid-cols-2">
            {connectedGroups.map((group) => {
              const definition = getServiceDefinition(group.services[0]);
              const busy = group.services.includes(busyServiceId);
              const isJira = group.id === 'jira';
              return (
                <ServiceCard
                  key={group.id}
                  definition={definition}
                  connected
                  status={group.status}
                  summary={group.summary}
                  disconnectable={group.disconnectable}
                  onManage={() => openOnboarding(group.services[0])}
                  onDisconnect={() => {
                    setBusyServiceId(group.services[0]);
                    handleDisconnect(group);
                  }}
                  busy={busy}
                  extraAction={
                    isJira && state.configuredServices?.jira ? (
                      <button
                        type="button"
                        onClick={() => setView('jira')}
                        className="inline-flex items-center gap-1.5 rounded-md border border-border-light px-2.5 py-1 text-[12px] font-medium text-neutral-700 transition-colors hover:bg-neutral-100 dark:border-border-dark dark:text-neutral-300 dark:hover:bg-neutral-800"
                      >
                        <IconExternal size={11} />
                        Open board
                      </button>
                    ) : null
                  }
                />
              );
            })}
          </div>
        )}
      </section>

      <section>
        <div className="mb-4">
          <h2 className="text-[15px] font-semibold text-neutral-900 dark:text-neutral-100">
            Available services
          </h2>
          <p className="mt-0.5 text-[12px] text-neutral-500 dark:text-neutral-400">
            Click one to connect it with the guided setup.
          </p>
        </div>
        <div className="grid gap-3 md:grid-cols-2 xl:grid-cols-3">
          {availableServices.map((definition) => (
            <ServiceCard
              key={definition.id}
              definition={definition}
              connected={false}
              onAdd={() => openOnboarding(definition.id)}
            />
          ))}
          {availableServices.length === 0 && (
            <p className="col-span-full py-6 text-center text-[12px] text-neutral-400 dark:text-neutral-500">
              Every service is already added.
            </p>
          )}
        </div>
      </section>

      <ServiceOnboardingModal
        open={onboardingOpen}
        initialServiceId={activeServiceId}
        requiredConnection={false}
        hasConnectedServices={connectedServices.length > 0}
        state={state}
        api={api}
        loadSettings={loadSettings}
        checkConnectionStatus={checkConnectionStatus}
        onClose={() => setOnboardingOpen(false)}
      />
    </div>
  );
}
