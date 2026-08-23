/**
 * FlagButton: the admin-only annotation control on a bot response.
 * The icon state is what tells an operator at a glance whether a
 * response is flagged, so state → label/appearance is asserted, along
 * with the popover's save path and its dismissal routes.
 */
import { render, screen, fireEvent } from '@testing-library/react';
import FlagButton from './FlagButton';

const FLAG = {
  id: 7,
  session_id: 's-1',
  message_index: 3,
  response_index: 0,
  bot_name: 'bot-alpha',
  response_text: 'hello',
  comment: 'hallucinated a citation',
  resolved: false,
  created_by: 'admin',
  created_at: '2026-01-02T03:04:05Z',
};

test('unflagged response offers "Flag response"', () => {
  render(<FlagButton onSave={jest.fn()} />);
  expect(
    screen.getByRole('button', { name: 'Flag response' })
  ).toBeInTheDocument();
});

test('an existing flag switches the label to edit mode', () => {
  render(<FlagButton flag={FLAG} onSave={jest.fn()} />);
  expect(
    screen.getByRole('button', { name: 'Edit flag comment' })
  ).toBeInTheDocument();
});

test('popover prefills the stored comment and saves the edit', async () => {
  const onSave = jest.fn();
  render(<FlagButton flag={FLAG} onSave={onSave} />);

  fireEvent.click(
    screen.getByRole('button', { name: 'Edit flag comment' })
  );
  const textarea = screen.getByRole('textbox');
  expect(textarea).toHaveValue('hallucinated a citation');

  fireEvent.change(textarea, { target: { value: 'off persona' } });
  fireEvent.click(screen.getByRole('button', { name: 'Save' }));

  expect(onSave).toHaveBeenCalledWith(
    'off persona',
    expect.objectContaining({ botName: null })
  );
  // Saving closes the popover.
  expect(screen.queryByRole('textbox')).not.toBeInTheDocument();
});

test('resolve toggle and provenance line appear only for a saved flag', () => {
  const { unmount } = render(<FlagButton onSave={jest.fn()} />);
  fireEvent.click(
    screen.getByRole('button', { name: 'Flag response' })
  );
  expect(
    screen.queryByRole('button', { name: /Mark resolved|Reopen/ })
  ).not.toBeInTheDocument();
  unmount();

  const onToggleResolved = jest.fn();
  render(
    <FlagButton flag={FLAG} onToggleResolved={onToggleResolved} />
  );
  fireEvent.click(
    screen.getByRole('button', { name: 'Edit flag comment' })
  );
  fireEvent.click(
    screen.getByRole('button', { name: 'Mark resolved' })
  );
  expect(onToggleResolved).toHaveBeenCalledWith(FLAG);
});

test('a resolved flag offers "Reopen" instead', () => {
  render(<FlagButton flag={{ ...FLAG, resolved: true }} />);
  fireEvent.click(
    screen.getByRole('button', { name: 'Edit flag comment' })
  );
  expect(
    screen.getByRole('button', { name: 'Reopen' })
  ).toBeInTheDocument();
});

test('popover dismisses on Escape and on click-outside', () => {
  render(
    <div>
      <span data-testid="outside">elsewhere</span>
      <FlagButton onSave={jest.fn()} />
    </div>
  );
  const open = () =>
    fireEvent.click(
      screen.getByRole('button', { name: 'Flag response' })
    );

  open();
  expect(screen.getByRole('textbox')).toBeInTheDocument();
  fireEvent.keyDown(document, { key: 'Escape' });
  expect(screen.queryByRole('textbox')).not.toBeInTheDocument();

  open();
  fireEvent.mouseDown(screen.getByTestId('outside'));
  expect(screen.queryByRole('textbox')).not.toBeInTheDocument();
});
