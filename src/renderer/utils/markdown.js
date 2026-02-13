/**
 * Simple markdown parser
 * @param {string} text - The markdown text to parse
 * @returns {string} - The resulting HTML
 */
export function parseMarkdown(text) {
  if (!text) return '';

  // Escape HTML entities to prevent XSS
  let html = text
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;');

  const lines = html.split('\n');
  let inList = false;
  let listType = null; // 'ul' or 'ol'
  let inCodeBlock = false;
  let result = [];

  for (let i = 0; i < lines.length; i++) {
    let line = lines[i];

    // Code Blocks (Fenced)
    if (line.match(/^```/)) {
        if (inCodeBlock) {
            result.push('</code></pre>');
            inCodeBlock = false;
        } else {
            if (inList) {
                result.push(listType === 'ol' ? '</ol>' : '</ul>');
                inList = false;
                listType = null;
            }
            // Add class for styling
            result.push('<pre class="overflow-x-auto p-4 bg-gray-100 dark:bg-gray-800 rounded-lg my-4 text-sm font-mono text-gray-800 dark:text-gray-200"><code>');
            inCodeBlock = true;
        }
        continue;
    }

    if (inCodeBlock) {
        result.push(line);
        continue;
    }

    // Headers
    const h3Match = line.match(/^### (.*)/);
    if (h3Match) {
        if (inList) { result.push(listType === 'ol' ? '</ol>' : '</ul>'); inList = false; listType = null; }
        result.push(`<h3>${processInline(h3Match[1])}</h3>`);
        continue;
    }
    const h2Match = line.match(/^## (.*)/);
    if (h2Match) {
        if (inList) { result.push(listType === 'ol' ? '</ol>' : '</ul>'); inList = false; listType = null; }
        result.push(`<h2>${processInline(h2Match[1])}</h2>`);
        continue;
    }
    const h1Match = line.match(/^# (.*)/);
    if (h1Match) {
        if (inList) { result.push(listType === 'ol' ? '</ol>' : '</ul>'); inList = false; listType = null; }
        result.push(`<h1>${processInline(h1Match[1])}</h1>`);
        continue;
    }

    // Blockquotes
    const bqMatch = line.match(/^&gt; (.*)/);
    if (bqMatch) {
        if (inList) { result.push(listType === 'ol' ? '</ol>' : '</ul>'); inList = false; listType = null; }
        result.push(`<blockquote>${processInline(bqMatch[1])}</blockquote>`);
        continue;
    }

    // Unordered Lists
    const ulMatch = line.match(/^(\s*)(?:-|\*)\s+(.*)/);
    if (ulMatch) {
      if (inList && listType === 'ol') {
          result.push('</ol>');
          inList = false;
          listType = null;
      }
      if (!inList) {
        result.push('<ul>');
        inList = true;
        listType = 'ul';
      }
      let content = ulMatch[2];
      content = processInline(content);
      result.push(`<li>${content}</li>`);
      continue;
    }

    // Ordered Lists
    const olMatch = line.match(/^(\s*)\d+\.\s+(.*)/);
    if (olMatch) {
      if (inList && listType === 'ul') {
          result.push('</ul>');
          inList = false;
          listType = null;
      }
      if (!inList) {
        result.push('<ol>');
        inList = true;
        listType = 'ol';
      }
      let content = olMatch[2];
      content = processInline(content);
      result.push(`<li>${content}</li>`);
      continue;
    }

    // Close list if line is empty or other block
    if (inList) {
        if (line.trim() === '') {
            // Keep list open on empty line
            continue;
        } else {
            result.push(listType === 'ol' ? '</ol>' : '</ul>');
            inList = false;
            listType = null;
        }
    }

    // Empty lines
    if (line.trim() === '') {
        continue;
    }

    // Paragraphs
    let content = processInline(line);
    result.push(`<p>${content}</p>`);
  }

  if (inList) {
    result.push(listType === 'ol' ? '</ol>' : '</ul>');
  }

  return result.join('\n');
}

function processInline(text) {
  // Images: ![alt](src)
  text = text.replace(/!\[([^\]]*)\]\(([^)]+)\)/g, (match, alt, src) => {
      if (src.trim().toLowerCase().startsWith('javascript:')) return '';
      const safeSrc = src.replace(/"/g, '&quot;');
      const safeAlt = alt.replace(/"/g, '&quot;');
      return `<img src="${safeSrc}" alt="${safeAlt}" />`;
  });

  // Links: [text](url)
  text = text.replace(/\[([^\]]+)\]\(([^)]+)\)/g, (match, txt, url) => {
      if (url.trim().toLowerCase().startsWith('javascript:')) return txt;
      const safeUrl = url.replace(/"/g, '&quot;');
      return `<a href="${safeUrl}" target="_blank" rel="noopener noreferrer">${txt}</a>`;
  });

  // Bold
  text = text.replace(/\*\*(.*?)\*\*/g, '<strong>$1</strong>');
  // Italic
  text = text.replace(/\*(.*?)\*/g, '<em>$1</em>');
  // Inline Code
  text = text.replace(/`([^`]+)`/g, '<code>$1</code>');

  return text;
}
