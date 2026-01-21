import type { Computer } from '../store/types';

/**
 * Extracts the set of available CLI tools from a computer object based on the new schema.
 * Schema: tools: [{ 'CLI tools': ['Gemini CLI', 'claude CLI', ...] }]
 */
export function getAvailableTools(computer: Computer | undefined): Set<string> {
  if (!computer?.tools || !Array.isArray(computer.tools) || computer.tools.length === 0) {
    return new Set<string>();
  }

  const firstItem = computer.tools[0];
  if (firstItem && typeof firstItem === 'object' && 'CLI tools' in firstItem) {
    const cliTools = (firstItem as { 'CLI tools': string[] })['CLI tools'];
    if (Array.isArray(cliTools)) {
      return new Set(cliTools);
    }
  }

  return new Set<string>();
}

/**
 * Checks if a specific tool is available on a computer.
 * Handles mapping from internal tool IDs to display names.
 */
export function hasTool(computer: Computer | undefined, toolId: string): boolean {
  const tools = getAvailableTools(computer);

  if (toolId === 'gemini') return tools.has('Gemini CLI');
  if (toolId === 'claude-cli') return tools.has('claude CLI');
  if (toolId === 'codex') return tools.has('Codex CLI');
  if (toolId === 'cursor') return tools.has('cursor CLI');
  if (toolId === 'claude CLI') return tools.has('claude CLI'); // Direct check

  return tools.has(toolId);
}
