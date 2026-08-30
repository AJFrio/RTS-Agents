/**
 * Jules activity mapping — pure helpers ported from
 * mobile-webapp/src/services/jules-service.ts (mapActivity and friends).
 *
 * Produces the desktop-modal Activity shape consumed by AgentModal.
 */

/**
 * @param {Array<{media?: {data?: string, mimeType?: string}}>} [artifacts]
 * @returns {Array<{mimeType: string, dataUrl: string, kind: 'image'|'video'}>}
 */
export function extractMediaFromArtifacts(artifacts) {
  const items = [];
  if (!artifacts?.length) return items;

  for (const artifact of artifacts) {
    const media = artifact.media;
    if (!media?.data || !media.mimeType) continue;
    const kind = getMediaKind(media.mimeType);
    if (!kind) continue;
    items.push({
      mimeType: media.mimeType,
      dataUrl: `data:${media.mimeType};base64,${media.data}`,
      kind,
    });
  }
  return items;
}

/**
 * Media descriptors without the (potentially huge) base64 payloads — used for
 * list views; full payloads are fetched per-activity via getActivityMedia.
 *
 * @param {Array<{media?: {data?: string, mimeType?: string}}>} [artifacts]
 */
export function describeMediaFromArtifacts(artifacts) {
  const mediaPlaceholders = [];
  if (!artifacts?.length) {
    return { hasMedia: false, mediaCount: 0, mediaPlaceholders };
  }

  for (const artifact of artifacts) {
    const mimeType = artifact.media?.mimeType;
    if (!mimeType) continue;
    const kind = getMediaKind(mimeType);
    if (!kind) continue;
    mediaPlaceholders.push({ mimeType, kind });
  }

  return {
    hasMedia: mediaPlaceholders.length > 0,
    mediaCount: mediaPlaceholders.length,
    mediaPlaceholders,
  };
}

/**
 * @param {string} [patch] - unidiff patch text
 * @returns {string[]} file paths touched by the patch
 */
export function extractFilesFromPatch(patch) {
  if (!patch) return [];
  const files = [];
  const regex = /^\+\+\+ b\/(.+)$/gm;
  let match = regex.exec(patch);
  while (match !== null) {
    files.push(match[1]);
    match = regex.exec(patch);
  }
  return files;
}

/**
 * Map a raw Jules activity to the desktop Activity shape.
 *
 * @param {object} activity - raw Jules activity
 * @param {boolean} stripMedia - when true only media descriptors are attached
 */
export function mapActivity(activity, stripMedia) {
  const artifacts = activity.artifacts || [];
  const commands = artifacts
    .filter((a) => a.bashOutput?.command)
    .map((a) => a.bashOutput.command);
  const fileChanges = artifacts
    .filter((a) => a.changeSet?.gitPatch?.unidiffPatch)
    .flatMap((a) => extractFilesFromPatch(a.changeSet.gitPatch.unidiffPatch));

  const { title, description, message, planSteps } = buildTitleDescriptionMessage(
    activity,
    commands,
    fileChanges
  );

  const mapped = {
    id: activity.id,
    type: getActivityType(activity),
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
    return { ...mapped, ...describeMediaFromArtifacts(artifacts) };
  }

  const mediaItems = extractMediaFromArtifacts(artifacts);
  if (mediaItems.length > 0) {
    mapped.hasMedia = true;
    mapped.mediaCount = mediaItems.length;
    mapped.mediaItems = mediaItems;
  }
  return mapped;
}

function getMediaKind(mimeType) {
  if (mimeType.startsWith('image/')) return 'image';
  if (mimeType.startsWith('video/')) return 'video';
  return null;
}

function getActivityType(activity) {
  if (activity.planGenerated) return 'plan_generated';
  if (activity.planApproved) return 'plan_approved';
  if (activity.userMessaged) return 'user_messaged';
  if (activity.agentMessaged) return 'agent_messaged';
  if (activity.progressUpdated) return 'progress';
  if (activity.sessionCompleted) return 'completed';
  if (activity.sessionFailed) return 'session_failed';
  return 'unknown';
}

function buildTitleDescriptionMessage(activity, commands, fileChanges) {
  let title = activity.description || null;
  let description = null;
  let message = null;
  let planSteps;

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
