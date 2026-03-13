import React from 'react';
import { render, screen, waitFor } from '@testing-library/react';
import App from './App';

// Mock the API module
jest.mock('./services/api', () => ({
  __esModule: true,
  default: {
    get: jest.fn().mockResolvedValue({ data: { status: 'ok' } }),
    post: jest.fn().mockResolvedValue({ data: {} }),
  },
  fetchConfig: jest.fn().mockResolvedValue({
    bots: [
      { name: 'Bot A', model: 'gpt-4' },
      { name: 'Bot B', model: 'llama' },
    ],
    additional_categories: ['More helpful', 'More accurate'],
    main_preference_feedback: 'I select this option',
    feedback_config_name: 'test-config',
  }),
  createSession: jest.fn().mockResolvedValue({
    session_id: 'test-session-123',
  }),
  sendChat: jest.fn().mockResolvedValue({
    content: 'Test response',
  }),
  saveMessage: jest.fn().mockResolvedValue({}),
}));

test('renders chat page with header', async () => {
  render(<App />);
  await waitFor(() => {
    expect(screen.getByText(/GenAI Chat/i)).toBeInTheDocument();
  });
});

test('renders message input after config loads', async () => {
  render(<App />);
  await waitFor(() => {
    expect(
      screen.getByPlaceholderText(/Type a message/i)
    ).toBeInTheDocument();
  });
});

test('shows loading spinner initially', () => {
  render(<App />);
  expect(screen.getByRole('progressbar')).toBeInTheDocument();
});
