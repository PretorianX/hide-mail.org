import { render, screen } from '@testing-library/react';
import App from './App';

test('renders temporary mail service title', () => {
  render(<App />);
  const titleElement = screen.getByText(/Temporary Mail Service/i);
  expect(titleElement).toBeInTheDocument();
}); 