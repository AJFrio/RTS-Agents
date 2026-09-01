import React from 'react';
import { useApp } from '../../context/AppContext.jsx';
import {
  IconDevices,
  IconRepositories,
  IconPullRequests,
  IconGitBranch,
} from '../ui/icons.jsx';
import { StatusDot } from '../ui/status.jsx';
import { relativeTime, shortRepo, truncate } from './card-meta.js';
import TaskCard from './TaskCard.jsx';

function MetaDot() {
  return (
    <span aria-hidden="true" className="text-neutral-300 dark:text-neutral-600">
      ·
    </span>
  );
}

function CardShell({ onClick, children }) {
  return (
    <button
      type="button"
      onClick={onClick}
      className="w-full rounded-lg border border-border-light bg-card-light p-3 text-left transition-colors hover:border-border-strong-light dark:border-border-dark dark:bg-card-dark dark:hover:border-border-strong-dark dark:hover:bg-neutral-800/40"
    >
      {children}
    </button>
  );
}

function DeviceSurfaceCard({ card }) {
  const { setView, dispatch } = useApp();
  const online = card.thisDevice || String(card.status || '').toLowerCase() === 'on' || card.status === 'local';
  const repoCount = Array.isArray(card.repos) ? card.repos.length : (card.repoCount ?? 0);

  return (
    <CardShell
      onClick={() => {
        dispatch({ type: 'SET_FOCUSED_DEVICE', payload: card.id });
        setView('devices');
      }}
    >
      <div className="flex items-center gap-2">
        <span className="flex h-6 w-6 shrink-0 items-center justify-center rounded-sm bg-inset-light text-neutral-600 dark:bg-inset-dark dark:text-neutral-300">
          <IconDevices size={13} />
        </span>
        <span className="min-w-0 flex-1 truncate text-[13px] font-medium text-neutral-900 dark:text-neutral-100">
          {card.name || card.id}
        </span>
        {card.thisDevice && (
          <span className="shrink-0 rounded-full bg-neutral-200/70 px-2 py-0.5 text-[10px] font-medium text-neutral-600 dark:bg-neutral-800 dark:text-neutral-300">
            This device
          </span>
        )}
      </div>
      <div className="mt-1.5 flex flex-wrap items-center gap-2 pl-8 text-[11px] text-neutral-500 dark:text-neutral-400">
        <span className="inline-flex items-center gap-1.5">
          <StatusDot status={online ? 'running' : 'idle'} />
          {online ? 'Online' : card.status || 'Idle'}
        </span>
        <MetaDot />
        <span>{repoCount} repo{repoCount === 1 ? '' : 's'}</span>
        {card.lastHeartbeat && (
          <>
            <MetaDot />
            <span>{relativeTime(card.lastHeartbeat)}</span>
          </>
        )}
      </div>
    </CardShell>
  );
}

function RepoSurfaceCard({ card }) {
  const { setView } = useApp();
  const isGithub = card.source === 'github';
  const title = card.fullName || card.name || shortRepo(card.path) || 'Repository';

  return (
    <CardShell
      onClick={() => {
        setView(isGithub ? 'branches' : 'devices');
      }}
    >
      <div className="flex items-center gap-2">
        <span className="flex h-6 w-6 shrink-0 items-center justify-center rounded-sm bg-inset-light text-neutral-600 dark:bg-inset-dark dark:text-neutral-300">
          <IconRepositories size={13} />
        </span>
        <span className="min-w-0 flex-1 truncate text-[13px] font-medium text-neutral-900 dark:text-neutral-100">
          {title}
        </span>
        <span className="shrink-0 rounded-full bg-neutral-200/70 px-2 py-0.5 text-[10px] font-medium text-neutral-600 dark:bg-neutral-800 dark:text-neutral-300">
          {isGithub ? 'GitHub' : 'Local'}
        </span>
      </div>
      <div className="mt-1.5 flex flex-wrap items-center gap-2 pl-8 text-[11px] text-neutral-500 dark:text-neutral-400">
        {card.computerName && <span>{card.computerName}</span>}
        {card.path && (
          <>
            {card.computerName && <MetaDot />}
            <span className="min-w-0 truncate font-mono">{card.path}</span>
          </>
        )}
        {card.private && (
          <>
            <MetaDot />
            <span>private</span>
          </>
        )}
        {card.defaultBranch && (
          <>
            <MetaDot />
            <span className="inline-flex items-center gap-1 font-mono">
              <IconGitBranch size={11} />
              {card.defaultBranch}
            </span>
          </>
        )}
      </div>
    </CardShell>
  );
}

function prToModalPayload(card) {
  return {
    number: card.number,
    title: card.title,
    html_url: card.htmlUrl,
    user: { login: card.author },
    draft: card.draft,
    state: card.state,
    created_at: card.createdAt,
    node_id: card.nodeId,
    base: {
      ref: card.baseBranch,
      repo: {
        name: card.repo,
        owner: { login: card.owner },
        full_name: card.fullName || (card.owner && card.repo ? `${card.owner}/${card.repo}` : undefined),
      },
    },
    head: {
      ref: card.headBranch,
      sha: card.headSha,
      repo: {
        name: card.repo,
        owner: { login: card.owner },
      },
    },
  };
}

function PullRequestSurfaceCard({ card }) {
  const { openPrModal } = useApp();
  const repoLabel = card.fullName || (card.owner && card.repo ? `${card.owner}/${card.repo}` : 'Pull request');
  const state = String(card.state || 'open').toLowerCase();
  const stateLabel = card.draft ? 'Draft' : state;

  return (
    <CardShell onClick={() => openPrModal(prToModalPayload(card))}>
      <div className="flex items-center gap-2">
        <span className="flex h-6 w-6 shrink-0 items-center justify-center rounded-sm bg-inset-light text-neutral-600 dark:bg-inset-dark dark:text-neutral-300">
          <IconPullRequests size={13} />
        </span>
        <span className="min-w-0 flex-1 truncate text-[13px] font-medium text-neutral-900 dark:text-neutral-100">
          {card.title || `PR #${card.number}`}
        </span>
        <span className="shrink-0 rounded-full bg-neutral-200/70 px-2 py-0.5 text-[10px] font-medium text-neutral-600 dark:bg-neutral-800 dark:text-neutral-300">
          {stateLabel}
        </span>
      </div>
      <div className="mt-1.5 flex flex-wrap items-center gap-2 pl-8 text-[11px] text-neutral-500 dark:text-neutral-400">
        <span className="font-mono">
          {repoLabel}
          {card.number != null ? ` #${card.number}` : ''}
        </span>
        {card.author && (
          <>
            <MetaDot />
            <span>{card.author}</span>
          </>
        )}
        {card.createdAt && (
          <>
            <MetaDot />
            <span>{relativeTime(card.createdAt)}</span>
          </>
        )}
      </div>
      {card.body && (
        <p className="mt-1.5 pl-8 text-[12px] leading-relaxed text-neutral-500 dark:text-neutral-400">
          {truncate(card.body, 140)}
        </p>
      )}
    </CardShell>
  );
}

export default function SurfaceCard({ card }) {
  if (!card) return null;
  switch (card.kind) {
    case 'device':
      return <DeviceSurfaceCard card={card} />;
    case 'repo':
      return <RepoSurfaceCard card={card} />;
    case 'pr':
      return <PullRequestSurfaceCard card={card} />;
    default:
      return <TaskCard task={card} />;
  }
}
