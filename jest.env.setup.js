// Set env vars before any test module is loaded
// This ensures modules that capture env vars at import time (e.g. route.ts) get the right values
process.env.LIVEKIT_URL = 'wss://test.livekit.io';
process.env.LIVEKIT_API_KEY = 'test-key';
process.env.LIVEKIT_API_SECRET = 'test-secret';
