const fs = require('fs');
const path = require('path');
const assert = require('assert');

const markdownPath = path.join(__dirname, '../../src/renderer/utils/markdown.js');
if (!fs.existsSync(markdownPath)) {
    console.error('markdown.js not found');
    process.exit(1);
}

let code = fs.readFileSync(markdownPath, 'utf8');

// Replace export function with function and append module.exports
// This is a naive transform to make ESM workable in CommonJS for testing
code = code.replace(/export function/g, 'function');
code += '\nmodule.exports = { parseMarkdown };';

const tempPath = path.join(__dirname, 'temp_markdown.js');
fs.writeFileSync(tempPath, code);

try {
  const { parseMarkdown } = require(tempPath);

  console.log('Running Markdown Tests...');

  // Test 1: Headers
  assert.strictEqual(parseMarkdown('# Header 1').trim(), '<h1>Header 1</h1>');
  assert.strictEqual(parseMarkdown('# **Bold** Header').trim(), '<h1><strong>Bold</strong> Header</h1>');

  // Test 2: Paragraphs
  assert.strictEqual(parseMarkdown('Hello world').trim(), '<p>Hello world</p>');

  // Test 3: XSS Prevention
  // Test for javascript: URI in links
  const xssLink = '[XSS](javascript:alert(1))';
  const xssLinkHtml = parseMarkdown(xssLink);
  assert(!xssLinkHtml.includes('javascript:alert(1)'), 'Should not allow javascript: URI');

  // Test for HTML in content
  const htmlContent = '<img src=x onerror=alert(1)>';
  const htmlResult = parseMarkdown(htmlContent);
  assert(!htmlResult.includes('<img src=x onerror=alert(1)>'), 'Should escape HTML tags');

  // Test for quoted attributes in links
  const quoteLink = '[Link](foo"onclick="alert(1))';
  const quoteLinkHtml = parseMarkdown(quoteLink);
  assert(!quoteLinkHtml.includes('onclick="alert(1)'), 'Should escape quotes in URL');

  // Test 4: Code Blocks
  const codeBlock = '```\nconst x = 1;\n```';
  const codeBlockHtml = parseMarkdown(codeBlock);
  // console.log('Code Block HTML:', codeBlockHtml);
  assert(codeBlockHtml.includes('<pre'), 'Should render <pre>');
  assert(codeBlockHtml.includes('<code'), 'Should render <code>');

  // Test 5: Images
  const image = '![Alt](image.png)';
  const imageHtml = parseMarkdown(image);
  assert(imageHtml.includes('<img src="image.png" alt="Alt"'), 'Should render image');

  // Test 6: Ordered List (simple)
  const ol = '1. Item 1\n2. Item 2';
  const olHtml = parseMarkdown(ol);
  assert(olHtml.includes('<ol>'), 'Should render <ol>');
  assert(olHtml.includes('<li>Item 1</li>'), 'Should render list item');

  console.log('All Markdown tests passed!');
} catch (err) {
  console.error('Test failed:', err);
  process.exit(1);
} finally {
  if (fs.existsSync(tempPath)) {
    fs.unlinkSync(tempPath);
  }
}
