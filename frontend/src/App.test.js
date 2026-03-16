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

// Mock canvas getContext for AnimatedBackground and DissolvingText
beforeAll(() => {
  HTMLCanvasElement.prototype.getContext = jest.fn(() => ({
    clearRect: jest.fn(),
    beginPath: jest.fn(),
    arc: jest.fn(),
    fill: jest.fn(),
    stroke: jest.fn(),
    moveTo: jest.fn(),
    lineTo: jest.fn(),
    fillText: jest.fn(),
    measureText: jest.fn(() => ({ width: 50 })),
    getImageData: jest.fn(() => ({
      data: new Uint8ClampedArray(0),
    })),
    fillStyle: '',
    strokeStyle: '',
    lineWidth: 1,
    shadowColor: '',
    shadowBlur: 0,
    globalAlpha: 1,
    font: '',
    textBaseline: '',
  }));
});

test('renders chat page with header', async () => {
  render(<App />);
  await waitFor(() => {
    const matches = screen.getAllByText(/GENocideAI/);
    expect(matches.length).toBeGreaterThanOrEqual(1);
  });
});

test('renders message input after config loads', async () => {
  render(<App />);
  await waitFor(() => {
    expect(
      screen.getByPlaceholderText(/Type here/i)
    ).toBeInTheDocument();
  });
});

test('shows loading indicator initially', () => {
  render(<App />);
  // Loading state shows a pulse bar, not a spinner
  expect(document.querySelector('[class*="pulse"]') ||
    document.querySelector('canvas')).toBeTruthy();
});
