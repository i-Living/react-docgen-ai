// Mock for globby - matches ESM named export structure
const mockGlobby = jest.fn();

// Default: return empty array
mockGlobby.mockImplementation((patterns) => {
  if (typeof patterns === 'string') {
    const baseDir = patterns.split('/**')[0] || '';
    const ext = patterns.split('*.').pop() || '';
    if (baseDir === 'test-out' && ext === 'md') {
      return Promise.resolve([]);
    }
  }
  if (Array.isArray(patterns)) {
    return Promise.resolve([]);
  }
  return Promise.resolve([]);
});

// Named export to match ESM: export const globby = ...
exports.globby = mockGlobby;
