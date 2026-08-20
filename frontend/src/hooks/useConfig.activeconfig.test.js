/**
 * The chat must follow the server's active config (defaults.config),
 * which the admin "which bots answer" toggle pins. Without this the
 * page is stuck on the single-bot "default" config and picking
 * "v1 + v2" shows only one response.
 */
import { renderHook, waitFor, act } from '@testing-library/react';
import { MemoryRouter } from 'react-router-dom';
import useConfig from './useConfig';
import { fetchConfig } from '../services/api';

jest.mock('../services/api', () => ({ fetchConfig: jest.fn() }));

const wrapper = ({ children, initialEntries = ['/'] }) => (
  <MemoryRouter initialEntries={initialEntries}>{children}</MemoryRouter>
);

// Two named configs: default = 1 bot, comparison = 2 bots. defaults.config
// carries the active config name (what the admin toggle pins).
function mockConfigs(activeName) {
  fetchConfig.mockImplementation(async (name) => {
    const bots =
      name === 'comparison'
        ? [{ name: 'v1' }, { name: 'v2' }]
        : [{ name: 'v1' }];
    return { name, bots, defaults: { config: activeName, log: false } };
  });
}

beforeEach(() => fetchConfig.mockReset());

test('no override: follows default, shows one bot', async () => {
  mockConfigs('default');
  const { result } = renderHook(() => useConfig(), { wrapper });
  await waitFor(() => expect(result.current.config).toBeTruthy());
  expect(result.current.config.bots.map((b) => b.name)).toEqual(['v1']);
  expect(result.current.configName).toBe('default');
});

test('active=comparison: follows it, shows both bots', async () => {
  mockConfigs('comparison');
  const { result } = renderHook(() => useConfig(), { wrapper });
  await waitFor(() =>
    expect(result.current.config?.bots?.length).toBe(2)
  );
  expect(result.current.config.bots.map((b) => b.name)).toEqual([
    'v1',
    'v2',
  ]);
  // Followed defaults.config, not the literal "default".
  expect(result.current.configName).toBe('comparison');
  expect(fetchConfig).toHaveBeenCalledWith('default');
  expect(fetchConfig).toHaveBeenCalledWith('comparison');
});

test('explicit ?config= pins that config, no follow', async () => {
  mockConfigs('comparison'); // active is comparison...
  const { result } = renderHook(() => useConfig(), {
    wrapper: (p) =>
      wrapper({ ...p, initialEntries: ['/?config=default'] }),
  });
  await waitFor(() => expect(result.current.config).toBeTruthy());
  // ...but an explicit URL param wins and is NOT overridden.
  expect(result.current.config.name).toBe('default');
  expect(fetchConfig).toHaveBeenCalledTimes(1);
});

test('refetches when a genai:config-changed event fires', async () => {
  // Start with the single-bot default active, then flip the active
  // config to comparison and fire the event the header dispatches.
  let active = 'default';
  fetchConfig.mockImplementation(async (name) => {
    const bots =
      name === 'comparison'
        ? [{ name: 'v1' }, { name: 'v2' }]
        : [{ name: 'v1' }];
    return { name, bots, defaults: { config: active, log: false } };
  });

  const { result } = renderHook(() => useConfig(), { wrapper });
  await waitFor(() =>
    expect(result.current.config?.bots?.length).toBe(1)
  );

  // Admin toggles to "both": the active config becomes comparison and
  // the header notifies the chat.
  active = 'comparison';
  await act(async () => {
    window.dispatchEvent(new Event('genai:config-changed'));
  });

  await waitFor(() =>
    expect(result.current.config?.bots?.length).toBe(2)
  );
  expect(result.current.configName).toBe('comparison');
});
