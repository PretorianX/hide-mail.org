import { render, screen, fireEvent } from '@testing-library/react';
import { ThemeProvider } from 'styled-components';
import { lightTheme } from '../../theme/theme';
import { Input } from './Input';

function renderWithTheme(ui: React.ReactElement) {
  return render(<ThemeProvider theme={lightTheme}>{ui}</ThemeProvider>);
}

describe('Input', () => {
  it('renders with placeholder', () => {
    renderWithTheme(<Input placeholder="Type here" />);
    expect(screen.getByPlaceholderText('Type here')).toBeInTheDocument();
  });

  it('renders label when provided', () => {
    renderWithTheme(<Input label="Email" id="email" />);
    expect(screen.getByLabelText('Email')).toBeInTheDocument();
  });

  it('renders helper text', () => {
    renderWithTheme(<Input helperText="Required field" />);
    expect(screen.getByText('Required field')).toBeInTheDocument();
  });

  it('handles change events', () => {
    const onChange = jest.fn();
    renderWithTheme(<Input onChange={onChange} placeholder="Type" />);
    fireEvent.change(screen.getByPlaceholderText('Type'), {
      target: { value: 'hello' },
    });
    expect(onChange).toHaveBeenCalledTimes(1);
  });

  it('renders in error variant', () => {
    renderWithTheme(
      <Input variant="error" helperText="Invalid" placeholder="test" />,
    );
    expect(screen.getByText('Invalid')).toBeInTheDocument();
    expect(screen.getByPlaceholderText('test')).toBeInTheDocument();
  });

  it('uses warm border and surface styling', () => {
    renderWithTheme(<Input placeholder="Type" />);

    const inputRow = screen.getByPlaceholderText('Type').parentElement;

    expect(inputRow).toHaveStyleRule('border-color', lightTheme.colors.border);
    expect(inputRow).toHaveStyleRule('background', lightTheme.colors.surface);
  });
});
