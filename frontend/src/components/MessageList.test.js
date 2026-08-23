/**
 * MessageList flag wiring. The canvas effect components are stubbed —
 * they draw to a <canvas> and carry the eviction timers, neither of
 * which is what these tests are about.
 *
 * The invariants: nothing extra renders for participants, one flag
 * control per assistant response in admin mode, and never one on a
 * user turn or a still-streaming response.
 */
import { render, screen, fireEvent } from '@testing-library/react';
import MessageList from './MessageList';

jest.mock('./effects/SimultaneousEntropyMessage', () => ({
  SimultaneousEntropyMessage: ({ content }) => (
    <div data-testid="bubble">{content}</div>
  ),
}));
jest.mock('./effects/StreamingCanvasMessage', () => ({
  StreamingCanvasMessage: ({ content }) => (
    <div data-testid="streaming-bubble">{content}</div>
  ),
}));

const COMPARISON = {
  index: 1,
  role: 'assistant',
  bot_ids: ['bot-alpha', 'bot-beta'],
  selected: null,
  content: [
    { bot: 'bot-alpha', text: 'answer A' },
    { bot: 'bot-beta', text: 'answer B' },
  ],
};

const flagButtons = () => screen.queryAllByRole('button', {
  name: /Flag response|Edit flag comment/,
});

function renderList(props) {
  return render(
    <MessageList
      messages={[]}
      onSelectResponse={jest.fn()}
      {...props}
    />
  );
}

test('participant mode renders no flag controls at all', () => {
  renderList({ messages: [COMPARISON], adminMode: false });
  expect(flagButtons()).toHaveLength(0);
  // The participant affordance is untouched.
  expect(
    screen.getAllByRole('button', { name: 'Select' })
  ).toHaveLength(2);
});

test('admin mode puts one flag control on each pending comparison card', () => {
  renderList({ messages: [COMPARISON], adminMode: true });
  expect(flagButtons()).toHaveLength(2);
});

test('admin mode puts one flag control on each parallel column', () => {
  renderList({
    messages: [COMPARISON],
    adminMode: true,
    testMode: true,
  });
  expect(flagButtons()).toHaveLength(2);
});

test('a resolved comparison carries a single flag for the selection', () => {
  renderList({
    messages: [{ ...COMPARISON, selected: 1 }],
    adminMode: true,
  });
  expect(flagButtons()).toHaveLength(1);
});

test('user turns and streaming responses never get a flag', () => {
  renderList({
    messages: [
      { index: 0, role: 'user', content: 'hi', bot_ids: [] },
      {
        index: 1,
        role: 'assistant',
        content: 'partial…',
        bot_ids: ['bot-alpha'],
        streaming: true,
      },
    ],
    adminMode: true,
  });
  expect(flagButtons()).toHaveLength(0);
  expect(screen.getByTestId('streaming-bubble')).toBeInTheDocument();
});

test('a plain assistant response flags at response_index 0', () => {
  const onSaveFlag = jest.fn();
  renderList({
    messages: [
      {
        index: 4,
        role: 'assistant',
        content: 'the single answer',
        bot_ids: ['bot-alpha'],
      },
    ],
    adminMode: true,
    getFlag: () => null,
    onSaveFlag,
  });

  fireEvent.click(
    screen.getByRole('button', { name: 'Flag response' })
  );
  fireEvent.change(screen.getByRole('textbox'), {
    target: { value: 'refused for no reason' },
  });
  fireEvent.click(screen.getByRole('button', { name: 'Save' }));

  expect(onSaveFlag).toHaveBeenCalledWith({
    messageIndex: 4,
    responseIndex: 0,
    botName: 'bot-alpha',
    responseText: 'the single answer',
    comment: 'refused for no reason',
  });
});

test('saving on a comparison card reports that card\'s response index', () => {
  const onSaveFlag = jest.fn();
  renderList({
    messages: [COMPARISON],
    adminMode: true,
    getFlag: () => null,
    onSaveFlag,
  });

  // Second card = the second response of message index 1.
  fireEvent.click(flagButtons()[1]);
  fireEvent.change(screen.getByRole('textbox'), {
    target: { value: 'wrong' },
  });
  fireEvent.click(screen.getByRole('button', { name: 'Save' }));

  expect(onSaveFlag).toHaveBeenCalledWith({
    messageIndex: 1,
    responseIndex: 1,
    botName: 'bot-beta',
    responseText: 'answer B',
    comment: 'wrong',
  });
});

test('an existing flag renders in its flagged state', () => {
  renderList({
    messages: [COMPARISON],
    adminMode: true,
    getFlag: (mi, ri) =>
      mi === 1 && ri === 0
        ? { id: 1, message_index: 1, response_index: 0, comment: 'x' }
        : null,
  });
  expect(
    screen.getAllByRole('button', { name: 'Edit flag comment' })
  ).toHaveLength(1);
  expect(
    screen.getAllByRole('button', { name: 'Flag response' })
  ).toHaveLength(1);
});
