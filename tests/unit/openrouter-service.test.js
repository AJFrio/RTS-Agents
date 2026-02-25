const mockRequest = jest.fn();

// Mock HttpService class with a factory that returns a mock constructor
jest.mock('../../src/main/services/http-service', () => {
  return jest.fn().mockImplementation(() => {
      return { request: mockRequest };
  });
});

describe('OpenRouterService Integration', () => {
  let openRouterService;

  beforeEach(() => {
    jest.resetModules();
    jest.clearAllMocks(); // Clear calls to mockRequest

    // Re-require service to get new instance using the mock HttpService
    openRouterService = require('../../src/main/services/openrouter-service');
  });

  test('should use HttpService for requests', async () => {
    openRouterService.setApiKey('test-key');
    mockRequest.mockResolvedValue({ data: [] });

    await openRouterService.getModels();

    expect(mockRequest).toHaveBeenCalledWith('/models', expect.objectContaining({
      method: 'GET',
      headers: {
        'Authorization': 'Bearer test-key'
      }
    }));
  });

  test('should throw if api key not set', async () => {
      openRouterService.setApiKey(null);
      await expect(openRouterService.request('/test')).rejects.toThrow('OpenRouter API key not configured');
  });
});
