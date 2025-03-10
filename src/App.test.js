import { render, screen } from '@testing-library/react';
import App from './App.js';

test('renders temporary mail service title', () => {
  render(<App />);
  const titleElement = screen.getByText(/Temporary Mail Service/i);
  expect(titleElement).toBeInTheDocument();
});

test('renders Mail Duck title', () => {
  render(<App />);
  const titleElement = screen.getByText(/Mail Duck/i);
  expect(titleElement).toBeInTheDocument();
});

test('renders ad containers', () => {
  render(<App />);
  const adElements = screen.getAllByText(/Google Ad/i);
  expect(adElements.length).toBeGreaterThan(0);
});

test('renders duck-themed content', () => {
  render(<App />);
  const duckMailElement = screen.getByText(/Duck Mail Address/i);
  expect(duckMailElement).toBeInTheDocument();
}); 