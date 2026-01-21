const path = require('path');

// Mock external modules
jest.mock('fs', () => ({
  existsSync: jest.fn(),
  readdirSync: jest.fn(),
  statSync: jest.fn(),
  readFileSync: jest.fn(),
  mkdirSync: jest.fn(),
}));
jest.mock('https');
jest.mock('os', () => ({
  homedir: jest.fn().mockReturnValue('/home/user'),
  platform: jest.fn().mockReturnValue('linux')
}));

describe('Image Attachments Support', () => {
  let claudeService;
  let codexService;
  let https;
  let requests = [];

  // Mock data
  const mockAttachments = [
    {
      id: 'img1',
      name: 'test.png',
      mimeType: 'image/png',
      dataUrl: 'data:image/png;base64,iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mNk+A8AAQUBAScY42YAAAAASUVORK5CYII='
    }
  ];
  const mockPrompt = 'Analyze this image';

  beforeEach(() => {
    jest.resetModules();
    jest.clearAllMocks();
    requests = [];

    https = require('https');

    // Default mock implementation for https.request
    https.request.mockImplementation((options, cb) => {
      const reqInfo = {
        options,
        body: ''
      };
      requests.push(reqInfo);

      const mockRes = {
        statusCode: 200,
        on: (event, handler) => {
          if (event === 'data') handler(JSON.stringify({ id: 'mock-id', content: [], object: 'thread', status: 'completed' }));
          if (event === 'end') handler();
        }
      };

      // Simulate async response
      setTimeout(() => cb(mockRes), 0);

      return {
        on: jest.fn(),
        write: jest.fn((chunk) => { reqInfo.body += chunk; }),
        end: jest.fn(),
        setTimeout: jest.fn(),
        destroy: jest.fn()
      };
    });

    claudeService = require('../../src/main/services/claude-service');
    codexService = require('../../src/main/services/codex-service');

    claudeService.setApiKey('test-claude-key');
    codexService.setApiKey('test-codex-key');
  });

  describe('ClaudeService', () => {
    test('createTask includes images in messages payload', async () => {
      await claudeService.createTask({
        prompt: mockPrompt,
        attachments: mockAttachments
      });

      const req = requests.find(r => r.options.path.includes('/messages'));
      expect(req).toBeDefined();

      const body = JSON.parse(req.body);

      expect(body.messages).toHaveLength(1);
      expect(body.messages[0].role).toBe('user');
      expect(Array.isArray(body.messages[0].content)).toBe(true);
      expect(body.messages[0].content).toHaveLength(2);

      // Check text part
      const textPart = body.messages[0].content.find(p => p.type === 'text');
      expect(textPart).toBeDefined();
      expect(textPart.text).toBe(mockPrompt);

      // Check image part
      const imagePart = body.messages[0].content.find(p => p.type === 'image');
      expect(imagePart).toBeDefined();
      expect(imagePart.source.type).toBe('base64');
      expect(imagePart.source.media_type).toBe('image/png');
      expect(imagePart.source.data).toBe('iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mNk+A8AAQUBAScY42YAAAAASUVORK5CYII=');
    });

    test('createTask handles prompt-only correctly', async () => {
      await claudeService.createTask({
        prompt: mockPrompt
      });

      const req = requests.find(r => r.options.path.includes('/messages'));
      const body = JSON.parse(req.body);

      // Should remain as before (or be array with text)
      // Existing implementation sends content as string
      // Modified implementation might send array with one text part, or string.
      // Test should accept valid formats.
      if (Array.isArray(body.messages[0].content)) {
          expect(body.messages[0].content[0].type).toBe('text');
          expect(body.messages[0].content[0].text).toBe(mockPrompt);
      } else {
          expect(body.messages[0].content).toBe(mockPrompt);
      }
    });
  });

  describe('CodexService', () => {
    test('createTask includes images in thread messages', async () => {
      await codexService.createTask({
        prompt: mockPrompt,
        attachments: mockAttachments
      });

      // Find the request to /threads (creation)
      const req = requests.find(r => r.options.path === '/v1/threads' && r.options.method === 'POST');
      expect(req).toBeDefined();

      const body = JSON.parse(req.body);

      expect(body.messages).toHaveLength(1);
      expect(body.messages[0].role).toBe('user');
      expect(Array.isArray(body.messages[0].content)).toBe(true);
      expect(body.messages[0].content).toHaveLength(2);

      // Check text part
      const textPart = body.messages[0].content.find(p => p.type === 'text');
      expect(textPart).toBeDefined();
      expect(textPart.text).toBe(mockPrompt);

      // Check image part
      const imagePart = body.messages[0].content.find(p => p.type === 'image_url');
      expect(imagePart).toBeDefined();
      expect(imagePart.image_url.url).toBe(mockAttachments[0].dataUrl);
    });

    test('createTask handles prompt-only correctly', async () => {
      await codexService.createTask({
        prompt: mockPrompt
      });

      const req = requests.find(r => r.options.path === '/v1/threads' && r.options.method === 'POST');
      const body = JSON.parse(req.body);

      // Should remain as before (string) or array
      if (Array.isArray(body.messages[0].content)) {
          expect(body.messages[0].content[0].type).toBe('text');
          expect(body.messages[0].content[0].text).toBe(mockPrompt);
      } else {
          expect(body.messages[0].content).toBe(mockPrompt);
      }
    });
  });
});
