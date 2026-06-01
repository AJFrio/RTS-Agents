/**
 * Jules API Service
 * Port of the Electron app's Jules service for web/mobile
 */

import type {
  AgentTask,
  AgentDetails,
  Repository,
  Activity,
  ActivityMediaItem,
  ActivityMediaPlaceholder,
} from '../store/types';

const BASE_URL = '/api/jules';

interface JulesSession {
  id: string;
  title?: string;
  prompt?: string;
  state?: string;
  createTime?: string;
  updateTime?: string;
  sourceContext?: {
    source?: string;
    githubRepoContext?: {
      startingBranch?: string;
    };
  };
  outputs?: Array<{
    pullRequest?: {
      url?: string;
      description?: string;
    };
  }>;
}

interface JulesSource {
  name: string;
  id: string;
  githubRepo?: {
    owner: string;
    repo: string;
  };
}

interface JulesArtifact {
  media?: { data?: string; mimeType?: string };
  bashOutput?: { command?: string };
  changeSet?: { gitPatch?: { unidiffPatch?: string } };
}

interface JulesActivity {
  id: string;
  createTime?: string;
  originator?: string;
  description?: string;
  progressUpdated?: { title?: string; description?: string };
  planGenerated?: {
    plan?: {
      steps?: Array<{ title?: string; description?: string }>;
    };
  };
  planApproved?: unknown;
  userMessaged?: { userMessage?: string };
  agentMessaged?: { agentMessage?: string };
  sessionCompleted?: unknown;
  sessionFailed?: { reason?: string };
  artifacts?: JulesArtifact[];
}

class JulesService {
  private apiKey: string | null = null;

  setApiKey(apiKey: string | null) {
    this.apiKey = apiKey;
  }

  getApiKey(): string | null {
    return this.apiKey;
  }

  isConfigured(): boolean {
    return !!this.apiKey;
  }

  private async request<T>(endpoint: string, method = 'GET', body?: unknown): Promise<T> {
    if (!this.apiKey) {
      throw new Error('Jules API key not configured');
    }

    const response = await fetch(`${BASE_URL}${endpoint}`, {
      method,
      headers: {
        'Content-Type': 'application/json',
        'X-API-Key': this.apiKey,
      },
      body: body ? JSON.stringify(body) : undefined,
    });

    if (!response.ok) {
      const errorText = await response.text();
      throw new Error(`Jules API error: ${response.status} - ${errorText}`);
    }

    return response.json();
  }

  async listSessions(pageSize = 20, pageToken?: string): Promise<{ sessions?: JulesSession[]; nextPageToken?: string }> {
    let endpoint = `/sessions?pageSize=${pageSize}`;
    if (pageToken) {
      endpoint += `&pageToken=${pageToken}`;
    }
    return this.request(endpoint);
  }

  async getSession(sessionId: string): Promise<JulesSession> {
    return this.request(`/sessions/${sessionId}`);
  }

  async listActivities(sessionId: string, pageSize = 30, pageToken?: string): Promise<{ activities?: JulesActivity[]; nextPageToken?: string }> {
    let endpoint = `/sessions/${sessionId}/activities?pageSize=${pageSize}`;
    if (pageToken) {
      endpoint += `&pageToken=${pageToken}`;
    }
    return this.request(endpoint);
  }

  async getActivity(sessionId: string, activityId: string): Promise<JulesActivity> {
    return this.request(`/sessions/${sessionId}/activities/${activityId}`);
  }

  private static assertResourceId(id: string, label: string): void {
    if (!id || !/^[a-zA-Z0-9_-]+$/.test(id)) {
      throw new Error(`Invalid Jules ${label}`);
    }
  }

  private getMediaKind(mimeType: string): 'image' | 'video' | null {
    if (mimeType.startsWith('image/')) return 'image';
    if (mimeType.startsWith('video/')) return 'video';
    return null;
  }

  extractMediaFromArtifacts(artifacts: JulesArtifact[] | undefined): ActivityMediaItem[] {
    const items: ActivityMediaItem[] = [];
    if (!artifacts?.length) return items;

    for (const artifact of artifacts) {
      const media = artifact.media;
      if (!media?.data || !media.mimeType) continue;
      const kind = this.getMediaKind(media.mimeType);
      if (!kind) continue;
      items.push({
        mimeType: media.mimeType,
        dataUrl: `data:${media.mimeType};base64,${media.data}`,
        kind,
      });
    }
    return items;
  }

  private describeMediaFromArtifacts(artifacts: JulesArtifact[] | undefined): {
    hasMedia: boolean;
    mediaCount: number;
    mediaPlaceholders: ActivityMediaPlaceholder[];
  } {
    const mediaPlaceholders: ActivityMediaPlaceholder[] = [];
    if (!artifacts?.length) {
      return { hasMedia: false, mediaCount: 0, mediaPlaceholders };
    }

    for (const artifact of artifacts) {
      const mimeType = artifact.media?.mimeType;
      if (!mimeType) continue;
      const kind = this.getMediaKind(mimeType);
      if (!kind) continue;
      mediaPlaceholders.push({ mimeType, kind });
    }

    return {
      hasMedia: mediaPlaceholders.length > 0,
      mediaCount: mediaPlaceholders.length,
      mediaPlaceholders,
    };
  }

  private extractFilesFromPatch(patch: string | undefined): string[] {
    if (!patch) return [];
    const files: string[] = [];
    const regex = /^\+\+\+ b\/(.+)$/gm;
    let match: RegExpExecArray | null;
    while ((match = regex.exec(patch)) !== null) {
      files.push(match[1]);
    }
    return files;
  }

  private getActivityType(activity: JulesActivity): string {
    if (activity.planGenerated) return 'plan_generated';
    if (activity.planApproved) return 'plan_approved';
    if (activity.userMessaged) return 'user_messaged';
    if (activity.agentMessaged) return 'agent_messaged';
    if (activity.progressUpdated) return 'progress';
    if (activity.sessionCompleted) return 'completed';
    if (activity.sessionFailed) return 'session_failed';
    return 'unknown';
  }

  private getActivityTitleDescriptionMessage(
    activity: JulesActivity,
    _type: string,
    commands: string[],
    fileChanges: string[]
  ): Pick<Activity, 'title' | 'description' | 'message' | 'planSteps'> {
    let title: string | null = activity.description || null;
    let description: string | null = null;
    let message: string | null = null;
    let planSteps: Activity['planSteps'] = undefined;

    if (activity.planGenerated?.plan?.steps?.length) {
      const steps = activity.planGenerated.plan.steps;
      planSteps = steps.map((s) => ({
        title: s.title || '',
        description: s.description || '',
      }));
      if (!title) title = steps[0]?.title || 'Plan generated';
      if (!description && steps[0]?.description) description = steps[0].description;
    } else if (activity.planApproved) {
      if (!title) title = 'Plan approved';
    } else if (activity.userMessaged?.userMessage) {
      if (!title) title = 'User message';
      message = activity.userMessaged.userMessage;
    } else if (activity.agentMessaged?.agentMessage) {
      if (!title) title = 'Agent message';
      message = activity.agentMessaged.agentMessage;
    } else if (activity.progressUpdated) {
      title = activity.progressUpdated.title || title || 'Progress';
      description = activity.progressUpdated.description || description;
    } else if (activity.sessionCompleted) {
      if (!title) title = 'Session completed';
    } else if (activity.sessionFailed?.reason) {
      if (!title) title = 'Session failed';
      message = activity.sessionFailed.reason;
    } else {
      if (commands.length > 0 && !title) title = 'Executed Command';
      if (fileChanges.length > 0 && !title) title = 'Code Changes';
    }

    return { title, description, message, planSteps };
  }

  private mapActivity(activity: JulesActivity, stripMedia: boolean): Activity {
    const artifacts = activity.artifacts || [];
    const commands = artifacts
      .filter((a) => a.bashOutput?.command)
      .map((a) => a.bashOutput!.command as string);
    const fileChanges = artifacts
      .filter((a) => a.changeSet?.gitPatch?.unidiffPatch)
      .flatMap((a) => this.extractFilesFromPatch(a.changeSet!.gitPatch!.unidiffPatch));

    const type = this.getActivityType(activity);
    const { title, description, message, planSteps } = this.getActivityTitleDescriptionMessage(
      activity,
      type,
      commands,
      fileChanges
    );

    const mapped: Activity = {
      id: activity.id,
      type,
      originator: activity.originator,
      title,
      description,
      message,
      planSteps,
      timestamp: activity.createTime,
      commands,
      fileChanges,
    };

    if (stripMedia) {
      return { ...mapped, ...this.describeMediaFromArtifacts(artifacts) };
    }

    const mediaItems = this.extractMediaFromArtifacts(artifacts);
    if (mediaItems.length > 0) {
      mapped.hasMedia = true;
      mapped.mediaCount = mediaItems.length;
      mapped.mediaItems = mediaItems;
    }
    return mapped;
  }

  async listSources(pageSize = 20, pageToken?: string): Promise<{ sources?: JulesSource[]; nextPageToken?: string }> {
    let endpoint = `/sources?pageSize=${pageSize}`;
    if (pageToken) {
      endpoint += `&pageToken=${pageToken}`;
    }
    return this.request(endpoint);
  }

  normalizeSession(session: JulesSession): AgentTask {
    return {
      id: `jules-${session.id}`,
      provider: 'jules',
      name: session.title || 'Jules Session',
      status: this.mapStatus(session),
      prompt: session.prompt || '',
      repository: this.extractRepository(session),
      branch: session.sourceContext?.githubRepoContext?.startingBranch || null,
      prUrl: this.extractPrUrl(session),
      createdAt: session.createTime ? new Date(session.createTime) : null,
      updatedAt: session.updateTime ? new Date(session.updateTime) : null,
      summary: this.extractSummary(session),
      rawId: session.id,
      webUrl: `https://jules.google.com/session/${session.id}`,
      source: session.sourceContext?.source || null,
    };
  }

  private mapStatus(session: JulesSession): AgentTask['status'] {
    if (session.outputs && session.outputs.length > 0) {
      return 'completed';
    }

    if (!session.state) {
      return 'pending';
    }

    const stateMap: Record<string, AgentTask['status']> = {
      'QUEUED': 'pending',
      'PLANNING': 'running',
      'AWAITING_PLAN_APPROVAL': 'pending',
      'AWAITING_USER_FEEDBACK': 'pending',
      'IN_PROGRESS': 'running',
      'PAUSED': 'stopped',
      'FAILED': 'failed',
      'COMPLETED': 'completed',
      'STATE_UNSPECIFIED': 'pending',
    };

    return stateMap[session.state] || 'pending';
  }

  private extractRepository(session: JulesSession): string | null {
    const source = session.sourceContext?.source;
    if (source && source.startsWith('sources/github/')) {
      const parts = source.replace('sources/github/', '').split('/');
      if (parts.length >= 2) {
        return `https://github.com/${parts[0]}/${parts[1]}`;
      }
    }
    return null;
  }

  private extractPrUrl(session: JulesSession): string | null {
    if (session.outputs) {
      for (const output of session.outputs) {
        if (output.pullRequest?.url) {
          return output.pullRequest.url;
        }
      }
    }
    return null;
  }

  private extractSummary(session: JulesSession): string | null {
    if (session.outputs) {
      for (const output of session.outputs) {
        if (output.pullRequest?.description) {
          return output.pullRequest.description;
        }
      }
    }
    return null;
  }

  async getAllAgents(): Promise<AgentTask[]> {
    const response = await this.listSessions(100);
    const sessions = response.sessions || [];
    return sessions.map(session => this.normalizeSession(session));
  }

  async getAgentDetailsText(sessionId: string): Promise<AgentDetails> {
    JulesService.assertResourceId(sessionId, 'session ID');

    const [session, activitiesResponse] = await Promise.all([
      this.getSession(sessionId),
      this.listActivities(sessionId, 100),
    ]);

    const activities = (activitiesResponse.activities || []).map((activity) =>
      this.mapActivity(activity, true)
    );

    return {
      ...this.normalizeSession(session),
      activities,
    };
  }

  async getActivityMedia(
    sessionId: string,
    activityId: string
  ): Promise<{ mediaItems: ActivityMediaItem[] }> {
    JulesService.assertResourceId(sessionId, 'session ID');
    JulesService.assertResourceId(activityId, 'activity ID');

    const activity = await this.getActivity(sessionId, activityId);
    return { mediaItems: this.extractMediaFromArtifacts(activity.artifacts) };
  }

  async getAgentDetails(sessionId: string): Promise<AgentDetails> {
    return this.getAgentDetailsText(sessionId);
  }

  async testConnection(): Promise<{ success: boolean; error?: string }> {
    try {
      await this.listSources(1);
      return { success: true };
    } catch (err) {
      return { success: false, error: err instanceof Error ? err.message : 'Unknown error' };
    }
  }

  async getAllSources(): Promise<Repository[]> {
    const allSources: JulesSource[] = [];
    let pageToken: string | undefined;

    do {
      const response = await this.listSources(50, pageToken);
      if (response.sources) {
        allSources.push(...response.sources);
      }
      pageToken = response.nextPageToken;
    } while (pageToken);

    return allSources.map(source => ({
      id: source.name,
      name: source.id,
      owner: source.githubRepo?.owner || null,
      repo: source.githubRepo?.repo || null,
      displayName: source.githubRepo
        ? `${source.githubRepo.owner}/${source.githubRepo.repo}`
        : source.id,
    }));
  }

  async createSession(options: {
    prompt: string;
    source: string;
    branch?: string;
    title?: string;
    autoCreatePr?: boolean;
    requirePlanApproval?: boolean;
  }): Promise<AgentTask> {
    const { prompt, source, branch = 'main', title, autoCreatePr = true, requirePlanApproval = false } = options;

    if (!prompt) {
      throw new Error('Prompt is required');
    }
    if (!source) {
      throw new Error('Source is required');
    }

    const body: Record<string, unknown> = {
      prompt,
      sourceContext: {
        source,
        githubRepoContext: {
          startingBranch: branch,
        },
      },
    };

    if (autoCreatePr) {
      body.automationMode = 'AUTO_CREATE_PR';
    }
    if (title) {
      body.title = title;
    }
    if (requirePlanApproval) {
      body.requirePlanApproval = true;
    }

    const response = await this.request<JulesSession>('/sessions', 'POST', body);
    return this.normalizeSession(response);
  }

  async sendFollowup(sessionId: string, prompt: string): Promise<void> {
    if (!prompt) {
      throw new Error('Prompt is required');
    }

    await this.request(`/sessions/${sessionId}:sendMessage`, 'POST', {
      prompt,
    });
  }
}

export const julesService = new JulesService();
export default julesService;
