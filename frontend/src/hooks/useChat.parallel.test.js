/**
 * Parallel test mode: the two bots' histories must never mix, and a
 * bot that was inactive must catch up on the user turns it missed.
 *
 * buildHistory is internal to the hook, so these tests exercise it
 * through the same flattening rules by driving the hook's public
 * sendMessage and asserting on what the API layer was handed.
 */
import { renderHook, act, waitFor } from '@testing-library/react';
import useChat from './useChat';
import { sendChat } from '../services/api';

jest.mock('../services/api', () => ({
  sendChat: jest.fn(),
  streamChat: jest.fn(),
  saveMessage: jest.fn(() => Promise.resolve({ ok: true })),
}));

const BOTS = [
  { name: 'bot-alpha', display_name: 'Alpha' },
  { name: 'bot-beta', display_name: 'Beta' },
];

beforeEach(() => {
  sendChat.mockReset();
});

/** Reply with text that identifies which bot answered. */
function replyPerBot() {
  sendChat.mockImplementation((botName) =>
    Promise.resolve({ content: `${botName} says hi` })
  );
}

test('each bot only ever sees its own prior answers', async () => {
  replyPerBot();
  const { result } = renderHook(() =>
    useChat({ bots: BOTS, testMode: true })
  );

  await act(async () => {
    await result.current.sendMessage('first');
  });
  await waitFor(() => expect(result.current.messages).toHaveLength(2));

  sendChat.mockClear();
  await act(async () => {
    await result.current.sendMessage('second');
  });
  await waitFor(() => expect(sendChat).toHaveBeenCalledTimes(2));

  const [alphaCall, betaCall] = sendChat.mock.calls;
  const alphaHistory = alphaCall[1];
  const betaHistory = betaCall[1];

  const alphaAssistant = alphaHistory
    .filter((m) => m.role === 'assistant')
    .map((m) => m.content);
  const betaAssistant = betaHistory
    .filter((m) => m.role === 'assistant')
    .map((m) => m.content);

  expect(alphaAssistant).toEqual(['bot-alpha says hi']);
  expect(betaAssistant).toEqual(['bot-beta says hi']);
  // The decisive assertion: no cross-contamination either way.
  expect(alphaAssistant.join()).not.toContain('bot-beta');
  expect(betaAssistant.join()).not.toContain('bot-alpha');
});

test('both bots still see every user turn', async () => {
  replyPerBot();
  const { result } = renderHook(() =>
    useChat({ bots: BOTS, testMode: true })
  );

  await act(async () => {
    await result.current.sendMessage('first');
  });
  sendChat.mockClear();
  await act(async () => {
    await result.current.sendMessage('second');
  });
  await waitFor(() => expect(sendChat).toHaveBeenCalledTimes(2));

  sendChat.mock.calls.forEach(([, history]) => {
    const userTurns = history
      .filter((m) => m.role === 'user')
      .map((m) => m.content);
    expect(userTurns).toEqual(['first', 'second']);
  });
});

test('a re-activated bot catches up on the user turns it missed', async () => {
  replyPerBot();
  // Round 1: only alpha is active.
  const { result, rerender } = renderHook(
    ({ bots }) => useChat({ bots, testMode: true }),
    { initialProps: { bots: [BOTS[0]] } }
  );

  await act(async () => {
    await result.current.sendMessage('while beta was off');
  });

  // Beta comes back online.
  rerender({ bots: BOTS });
  sendChat.mockClear();
  await act(async () => {
    await result.current.sendMessage('beta is back');
  });
  await waitFor(() => expect(sendChat).toHaveBeenCalledTimes(2));

  const betaCall = sendChat.mock.calls.find(
    (c) => c[0] === 'bot-beta'
  );
  const betaHistory = betaCall[1];

  // It sees BOTH user turns, including the one it missed...
  expect(
    betaHistory.filter((m) => m.role === 'user').map((m) => m.content)
  ).toEqual(['while beta was off', 'beta is back']);
  // ...and has invented no answers of its own for the gap.
  expect(betaHistory.filter((m) => m.role === 'assistant')).toEqual([]);
});

test('RLHF mode is untouched: shared history, selection required', async () => {
  replyPerBot();
  const { result } = renderHook(() =>
    useChat({ bots: BOTS, testMode: false })
  );

  await act(async () => {
    await result.current.sendMessage('first');
  });
  // Pending comparison — not yet selected.
  sendChat.mockClear();
  await act(async () => {
    await result.current.sendMessage('second');
  });
  await waitFor(() => expect(sendChat).toHaveBeenCalledTimes(2));

  // Unselected comparison contributes nothing, and both bots get the
  // identical history.
  const [a, b] = sendChat.mock.calls;
  expect(a[1]).toEqual(b[1]);
  expect(a[1].filter((m) => m.role === 'assistant')).toEqual([]);
});
