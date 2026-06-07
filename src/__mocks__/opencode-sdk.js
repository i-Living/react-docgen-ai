/**
 * Mock for @opencode-ai/sdk
 * Used by Jest to avoid loading the real ESM-only SDK module in tests.
 * CommonJS format for Jest compatibility.
 */

class MockOpencodeClient {
  session = {
    create: async () => ({ data: { id: "mock-session" } }),
    prompt: async () => ({ data: { parts: [{ type: "text", text: "" }] } }),
    delete: async () => {},
  };
}

async function createOpencode() {
  return {
    client: new MockOpencodeClient(),
    server: { close: () => {} },
  };
}

function createOpencodeClient() {
  return new MockOpencodeClient();
}

function createOpencodeServer() {
  return Promise.resolve({ url: "http://localhost:0", close: () => {} });
}

module.exports = { OpencodeClient: MockOpencodeClient, createOpencode, createOpencodeClient, createOpencodeServer };
