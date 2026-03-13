import { render, screen } from '@testing-library/react';
import App from './App';

test('renders chat page with header', () => {
  render(<App />);
  const titleElement = screen.getByText(/GenAI Chat/i);
  expect(titleElement).toBeInTheDocument();
});

test('renders message input', () => {
  render(<App />);
  const inputElement = screen.getByPlaceholderText(/Type a message/i);
  expect(inputElement).toBeInTheDocument();
});

test('renders mock user message', () => {
  render(<App />);
  const userMessage = screen.getByText(/What is machine learning/i);
  expect(userMessage).toBeInTheDocument();
});
