/**
 * Focused tests for the SSE reader in `streamChat`. The reader has
 * three subtle behaviours worth pinning down:
 *
 *  - chunks may split mid-event (or mid-UTF-8 sequence)
 *  - `event: error\ndata: {...}` triggers `onError`, not `onChunk`
 *  - `data: [DONE]` triggers `onDone(accumulated)`
 *
 * We stub `global.fetch` to return a `Response` whose body is a
 * synthetic `ReadableStream`. No real network involvement.
 */

// Polyfill TextEncoder/TextDecoder for jsdom (Node provides them).
const _util = require('util');
if (typeof global.TextEncoder === 'undefined') {
  global.TextEncoder = _util.TextEncoder;
}
if (typeof global.TextDecoder === 'undefined') {
  global.TextDecoder = _util.TextDecoder;
}

// Axios v1 ships ESM-only by default; CRA's Jest config doesn't
// transform it. We stub it out — `streamChat` uses raw `fetch`, not
// axios, so the actual axios instance is never exercised here.
jest.mock('axios', () => ({
  __esModule: true,
  default: { create: () => ({ get: jest.fn(), post: jest.fn() }) },
}));

// eslint-disable-next-line import/first
import { streamChat } from './api';

function streamFromChunks(chunks) {
  // ReadableStream is available in jsdom 22+ via web-streams-polyfill,
  // but CRA 5's jest config does not expose it. We synthesize a tiny
  // duck-typed equivalent: getReader().read() resolves a chunk per
  // call, then {done: true}.
  let i = 0;
  return {
    getReader: () => ({
      read: () =>
        Promise.resolve(
          i < chunks.length
            ? { value: chunks[i++], done: false }
            : { value: undefined, done: true }
        ),
      cancel: () => Promise.resolve(),
    }),
  };
}

function makeResponse(chunks, ok = true, status = 200) {
  const enc = new TextEncoder();
  const bytes = chunks.map((c) =>
    typeof c === 'string' ? enc.encode(c) : c
  );
  return {
    ok,
    status,
    body: streamFromChunks(bytes),
    text: () => Promise.resolve(''),
  };
}

describe('streamChat SSE reader', () => {
  const originalFetch = global.fetch;
  afterEach(() => {
    global.fetch = originalFetch;
  });

  test('parses delta events and resolves on [DONE]', async () => {
    global.fetch = jest.fn().mockResolvedValue(
      makeResponse([
        'data: {"choices":[{"delta":{"content":"Hel"}}]}\n\n',
        'data: {"choices":[{"delta":{"content":"lo"}}]}\n\n',
        'data: [DONE]\n\n',
      ])
    );

    const chunks = [];
    let done;
    await streamChat('bot', [], {
      onChunk: (d, acc) => chunks.push([d, acc]),
      onDone: (acc) => {
        done = acc;
      },
      onError: () => {
        throw new Error('unexpected error');
      },
    });

    expect(chunks).toEqual([
      ['Hel', 'Hel'],
      ['lo', 'Hello'],
    ]);
    expect(done).toBe('Hello');
  });

  test('handles chunk boundaries inside events', async () => {
    // Two complete SSE events split across three TCP-like chunks
    // so the splitter has to buffer partial frames.
    global.fetch = jest.fn().mockResolvedValue(
      makeResponse([
        'data: {"choices":[{"delta":{"content":"A"}}]',
        '}\n\ndata: {"choices":[{"delta":',
        '{"content":"B"}}]}\n\ndata: [DONE]\n\n',
      ])
    );

    const out = [];
    let done;
    await streamChat('bot', [], {
      onChunk: (d) => out.push(d),
      onDone: (acc) => {
        done = acc;
      },
    });

    expect(out).toEqual(['A', 'B']);
    expect(done).toBe('AB');
  });

  test('event: error fires onError and skips onDone', async () => {
    global.fetch = jest.fn().mockResolvedValue(
      makeResponse([
        'event: error\ndata: {"message":"boom"}\n\ndata: [DONE]\n\n',
      ])
    );

    let errMsg;
    let doneCalled = false;
    await streamChat('bot', [], {
      onChunk: () => {},
      onDone: () => {
        doneCalled = true;
      },
      onError: (m) => {
        errMsg = m;
      },
    });

    expect(errMsg).toBe('boom');
    expect(doneCalled).toBe(false);
  });
});
