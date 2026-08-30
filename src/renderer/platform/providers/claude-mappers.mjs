/**
 * Claude conversation mapping helpers — pure functions ported from
 * mobile-webapp/src/services/claude-service.ts.
 */

export function extractConversationName(conversation) {
  if (conversation.title) return conversation.title;
  if (conversation.prompt) {
    return conversation.prompt.substring(0, 50) + (conversation.prompt.length > 50 ? '...' : '');
  }
  return `Claude Conversation ${conversation.id.substring(0, 8)}`;
}

export function extractSummary(conversation) {
  const content = conversation.lastResponse?.content;
  if (content && content.length > 0) {
    const text = content.find((c) => c.type === 'text')?.text;
    if (text) {
      return text.substring(0, 200) + (text.length > 200 ? '...' : '');
    }
  }
  return null;
}

export function mapStatus(conversation) {
  if (conversation.status) return conversation.status;
  if (conversation.lastResponse) return 'completed';
  return 'pending';
}

export function normalizeConversation(conversation) {
  return {
    id: `claude-cloud-${conversation.id}`,
    provider: 'claude-cloud',
    name: conversation.title || extractConversationName(conversation),
    status: mapStatus(conversation),
    prompt: conversation.prompt || '',
    repository: conversation.repository || null,
    branch: null,
    prUrl: null,
    createdAt: conversation.createdAt ? new Date(conversation.createdAt) : null,
    updatedAt: conversation.updatedAt ? new Date(conversation.updatedAt) : null,
    summary: extractSummary(conversation),
    rawId: conversation.id,
    webUrl: null,
  };
}