import React from 'react';
import { render, screen, fireEvent } from '@testing-library/react';
import '@testing-library/jest-dom';
import InboxSlots from './InboxSlots';

jest.mock('./ProCta', () => function MockProCta() {
  return <div data-testid="pro-cta">Go Pro</div>;
});

const slots = [
  { email: 'first@hide-mail.org', remainingSeconds: 1500, lifetimeSeconds: 1800 },
  { email: 'second@hide-mail.org', remainingSeconds: 1740, lifetimeSeconds: 1800 },
];

const renderStrip = (props = {}) => render(
  <InboxSlots
    slots={slots}
    activeEmail="first@hide-mail.org"
    limit={2}
    isPro={false}
    opening={false}
    error={null}
    onSelect={jest.fn()}
    onRelease={jest.fn()}
    onOpen={jest.fn()}
    {...props}
  />
);

describe('InboxSlots', () => {
  it('shows one chip per live inbox with the time it has left', () => {
    renderStrip();

    expect(screen.getByText('first@hide-mail.org')).toBeInTheDocument();
    expect(screen.getByText('second@hide-mail.org')).toBeInTheDocument();
    expect(screen.getByText('25m left')).toBeInTheDocument();
    expect(screen.getByText('29m left')).toBeInTheDocument();
  });

  it('says how much of the allowance is used', () => {
    renderStrip();

    expect(screen.getByText('2 of 2 open')).toBeInTheDocument();
  });

  it('marks the inbox being read', () => {
    renderStrip();

    expect(screen.getByRole('button', { name: 'Read first@hide-mail.org' }))
      .toHaveAttribute('aria-current', 'true');
    expect(screen.getByRole('button', { name: 'Read second@hide-mail.org' }))
      .toHaveAttribute('aria-current', 'false');
  });

  it('switches to another inbox when its chip is clicked', () => {
    const onSelect = jest.fn();
    renderStrip({ onSelect });

    fireEvent.click(screen.getByRole('button', { name: 'Read second@hide-mail.org' }));

    expect(onSelect).toHaveBeenCalledWith(slots[1]);
  });

  it('closes an inbox from its own chip', () => {
    const onRelease = jest.fn();
    renderStrip({ onRelease });

    fireEvent.click(screen.getByRole('button', { name: 'Close second@hide-mail.org' }));

    expect(onRelease).toHaveBeenCalledWith(slots[1]);
  });

  it('opens another inbox when there is room', () => {
    const onOpen = jest.fn();
    renderStrip({ slots: [slots[0]], limit: 2, onOpen });

    fireEvent.click(screen.getByRole('button', { name: /new inbox/i }));

    expect(onOpen).toHaveBeenCalled();
  });

  it('cannot open another inbox once the allowance is used up', () => {
    renderStrip();

    expect(screen.getByRole('button', { name: /new inbox/i })).toBeDisabled();
  });

  it('explains what Pro raises the number to, only to free visitors', () => {
    renderStrip();

    expect(screen.getByText(/Hide Mail Pro keeps 10/i)).toBeInTheDocument();
    expect(screen.getByTestId('pro-cta')).toBeInTheDocument();
  });

  it('does not upsell a Pro holder who filled their slots', () => {
    renderStrip({ isPro: true, limit: 2 });

    expect(screen.queryByTestId('pro-cta')).not.toBeInTheDocument();
  });

  it('reports a refusal from the server', () => {
    renderStrip({ error: 'This browser already keeps 2 inboxes open' });

    expect(screen.getByRole('alert')).toHaveTextContent('already keeps 2 inboxes open');
  });

  it('renders nothing at all when there are no slots to show', () => {
    const { container } = renderStrip({ slots: [] });

    expect(container).toBeEmptyDOMElement();
  });

  it('says the capability is free while an inbox is being opened', () => {
    renderStrip({ slots: [slots[0]], opening: true });

    expect(screen.getByRole('button', { name: /opening/i })).toBeDisabled();
  });
});
