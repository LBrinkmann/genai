/**
 * /admin/flags — the review surface for admin response flags.
 *
 * The whole API layer is mocked (`../services/api`), which also covers
 * `useAdmin`'s getMe/login/logout, so no axios and no network here.
 */
import { render, screen, waitFor, act } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { MemoryRouter } from 'react-router-dom';
import AdminFlags from './AdminFlags';
import {
  getMe,
  listFlags,
  updateFlag,
  getFlagContext,
} from '../services/api';

jest.mock('../services/api', () => ({
  getMe: jest.fn(),
  login: jest.fn(),
  logout: jest.fn(),
  listFlags: jest.fn(),
  updateFlag: jest.fn(),
  getFlagContext: jest.fn(),
}));

const FLAG = {
  id: 7,
  session_id: 'sess-1',
  message_index: 1,
  response_index: 1,
  bot_name: 'v2',
  response_text: 'Paris is the capital of Germany.',
  comment: 'Hallucinated capital',
  resolved: false,
  created_by: 'admin',
  created_at: new Date().toISOString(),
  updated_at: new Date().toISOString(),
};

const CONTEXT = {
  flag: FLAG,
  session: {
    session_id: 'sess-1',
    user_id: 'user-42',
    feedback_config_name: 'comparison',
    created_at: new Date().toISOString(),
  },
  messages: [
    {
      index: 0,
      role: 'user',
      content: 'What is the capital of Germany?',
      bot_ids: [],
      feedback: [],
      selected: null,
      timestamp: new Date().toISOString(),
    },
    {
      index: 1,
      role: 'assistant',
      content: [
        { bot: 'v1', text: 'Berlin is the capital of Germany.' },
        { bot: 'v2', text: 'Paris is the capital of Germany.' },
      ],
      bot_ids: ['v1', 'v2'],
      feedback: [],
      selected: 0,
      timestamp: new Date().toISOString(),
    },
  ],
};

// user-event v13 has no `setup()`; its handlers are sync, so wrap the
// click in act to flush the state updates the click's promises trigger.
async function clickAsync(el) {
  await act(async () => {
    userEvent.click(el);
  });
}

function renderPage() {
  return render(
    <MemoryRouter>
      <AdminFlags />
    </MemoryRouter>
  );
}

beforeEach(() => {
  jest.clearAllMocks();
  getMe.mockResolvedValue({ authenticated: true, user: 'admin' });
  listFlags.mockResolvedValue([FLAG]);
  getFlagContext.mockResolvedValue(CONTEXT);
  updateFlag.mockImplementation(async (id, patch) => ({
    ...FLAG,
    ...patch,
  }));
});

test('unauthenticated shows the login gate and loads no flags', async () => {
  getMe.mockResolvedValue({ authenticated: false });
  renderPage();

  expect(
    await screen.findByText(/Please log in to review response flags/i)
  ).toBeInTheDocument();
  expect(
    screen.getByRole('button', { name: /log in/i })
  ).toBeInTheDocument();
  expect(listFlags).not.toHaveBeenCalled();
});

test('renders a row per flag, defaulting to the open filter', async () => {
  renderPage();

  expect(
    await screen.findByRole('button', { name: /Hallucinated capital/i })
  ).toBeInTheDocument();
  expect(listFlags).toHaveBeenCalledWith({ status: 'open' });
  // Snapshot, author and resolved badge all surface on the row.
  expect(screen.getByText(/Paris is the capital/i)).toBeInTheDocument();
  expect(screen.getByText(/by admin/i)).toBeInTheDocument();
  // "Open" appears twice: the filter tab and the row's status badge.
  expect(screen.getAllByText('Open')).toHaveLength(2);
});

test('empty list renders an explicit empty state', async () => {
  listFlags.mockResolvedValue([]);
  renderPage();

  expect(await screen.findByText(/No open flags yet/i)).toBeInTheDocument();
});

test('the status filter passes the selected status through', async () => {
  renderPage();
  await screen.findByRole('button', { name: /Hallucinated capital/i });

  await clickAsync(screen.getByRole('button', { name: 'Resolved' }));
  await waitFor(() =>
    expect(listFlags).toHaveBeenCalledWith({ status: 'resolved' })
  );

  await clickAsync(screen.getByRole('button', { name: 'All' }));
  await waitFor(() =>
    expect(listFlags).toHaveBeenCalledWith({ status: 'all' })
  );
});

test('opening a row renders the transcript with the flagged response marked', async () => {
  renderPage();

  await clickAsync(
    await screen.findByRole('button', { name: /Hallucinated capital/i })
  );

  await waitFor(() => expect(getFlagContext).toHaveBeenCalledWith(7));
  // Session metadata plus the full conversation, both turns.
  expect(await screen.findByText('user-42')).toBeInTheDocument();
  expect(
    screen.getByText(/What is the capital of Germany\?/i)
  ).toBeInTheDocument();
  expect(screen.getByText(/Berlin is the capital/i)).toBeInTheDocument();

  // response_index 1 is the flagged one, response_index 0 is not.
  const flagged = screen.getByTestId('flagged-response');
  expect(flagged).toHaveTextContent(/Paris is the capital/i);
  expect(screen.getByTestId('response')).toHaveTextContent(
    /Berlin is the capital/i
  );
});

test('a never-logged conversation shows a note, not an empty transcript', async () => {
  getFlagContext.mockResolvedValue({
    flag: FLAG,
    session: null,
    messages: [],
  });
  renderPage();

  await clickAsync(
    await screen.findByRole('button', { name: /Hallucinated capital/i })
  );

  expect(
    await screen.findByText(/This conversation was not logged/i)
  ).toBeInTheDocument();
  expect(screen.queryByTestId('flagged-response')).not.toBeInTheDocument();
  // Falls back to the stored snapshot.
  expect(screen.getByText(/Paris is the capital/i)).toBeInTheDocument();
});

test('saving a comment calls updateFlag and reflects the new value', async () => {
  renderPage();

  await clickAsync(
    await screen.findByRole('button', { name: /Hallucinated capital/i })
  );

  const box = await screen.findByLabelText(/Comment/i);
  expect(box).toHaveValue('Hallucinated capital');
  await act(async () => {
    userEvent.clear(box);
    userEvent.type(box, 'Wrong capital, off-persona');
  });
  await clickAsync(screen.getByRole('button', { name: /Save comment/i }));

  await waitFor(() =>
    expect(updateFlag).toHaveBeenCalledWith(7, {
      comment: 'Wrong capital, off-persona',
    })
  );
  expect(await screen.findByText('Saved')).toBeInTheDocument();

  // Back on the list, the row carries the edited comment without a refetch.
  await clickAsync(screen.getByRole('button', { name: /Back to flags/i }));
  expect(
    screen.getByRole('button', { name: /Wrong capital, off-persona/i })
  ).toBeInTheDocument();
});

test('resolving from the detail view drops the row from the open filter', async () => {
  renderPage();

  await clickAsync(
    await screen.findByRole('button', { name: /Hallucinated capital/i })
  );
  await clickAsync(
    await screen.findByRole('button', { name: /Mark resolved/i })
  );

  await waitFor(() =>
    expect(updateFlag).toHaveBeenCalledWith(7, { resolved: true })
  );
  await clickAsync(screen.getByRole('button', { name: /Back to flags/i }));
  expect(await screen.findByText(/No open flags yet/i)).toBeInTheDocument();
});
