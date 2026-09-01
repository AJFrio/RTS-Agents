import React, { useMemo } from 'react';
import DOMPurify from 'dompurify';
import { parseMarkdown } from '../../utils/markdown.js';

/**
 * Shared sanitized markdown renderer. Consolidates the DOMPurify +
 * parseMarkdown pattern previously duplicated across AgentModal and the
 * activity feed components.
 */
export default function MarkdownText({ text, id, className = '' }) {
  const html = useMemo(
    () => DOMPurify.sanitize(parseMarkdown(String(text ?? ''))),
    [text]
  );
  return (
    <div
      id={id}
      className={`markdown-content ${className}`}
      dangerouslySetInnerHTML={{ __html: html }}
    />
  );
}
