/**
 * Tests for the mock endpoint-activation logic. This mirrors the backend
 * gate (endpoint_control.aggregate_state) and is what drives manual QA in
 * `REACT_APP_MOCK_API=true` mode, so it's worth pinning down.
 *
 * The mock keeps module-level state (endpoint states + mode), so we reset
 * the module before each test for isolation.
 */

let mock;

beforeEach(() => {
  jest.resetModules();
  mock = require('./mockApi');
});

describe('mock endpoint gate', () => {
  test('defaults to asleep (paused endpoint, auto mode)', async () => {
    const s = await mock.getEndpointState();
    expect(s).toEqual({ ready: false, state: 'asleep', mode: 'auto' });
  });

  test('activate moves the endpoint into the waking state', async () => {
    const s = await mock.activateEndpoints();
    expect(s.ready).toBe(false);
    expect(s.state).toBe('waking');
  });

  test("mode 'off' reports disabled and blocks readiness", async () => {
    await mock.setEndpointMode('off');
    const s = await mock.getEndpointState();
    expect(s).toEqual({ ready: false, state: 'disabled', mode: 'off' });
  });

  test("mode 'on' reports ready regardless of endpoint state", async () => {
    const res = await mock.setEndpointMode('on');
    expect(res.mode).toBe('on');
    const s = await mock.getEndpointState();
    expect(s).toEqual({ ready: true, state: 'ready', mode: 'on' });
  });

  test('listLLMEndpoints returns { endpoints, mode }', async () => {
    const data = await mock.listLLMEndpoints();
    expect(Array.isArray(data.endpoints)).toBe(true);
    expect(data.endpoints.length).toBeGreaterThan(0);
    expect(data.mode).toBe('auto');
  });
});
