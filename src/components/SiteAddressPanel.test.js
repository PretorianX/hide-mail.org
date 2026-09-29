import React from 'react';
import { render, screen, fireEvent } from '@testing-library/react';
import { MemoryRouter } from 'react-router';
import SiteAddressPanel from './SiteAddressPanel';
import SiteAddressStore from '../services/SiteAddressStore';

const MAILBOX = 'nova7@hide-mail.org';

const renderPanel = (props = {}) =>
  render(
    <MemoryRouter>
      <SiteAddressPanel mailbox={MAILBOX} messages={[]} {...props} />
    </MemoryRouter>
  );

describe('SiteAddressPanel', () => {
  beforeEach(() => {
    localStorage.clear();
    Object.assign(navigator, { clipboard: { writeText: jest.fn().mockResolvedValue() } });
  });

  it('previews the address a typed site name would produce', () => {
    renderPanel();

    fireEvent.change(screen.getByLabelText(/where are you signing up/i), {
      target: { value: 'Netflix' },
    });

    expect(screen.getByTestId('site-address-preview')).toHaveTextContent(
      'nova7.netflix@hide-mail.org'
    );
  });

  it('keeps the address for the site once it is created', () => {
    renderPanel();

    fireEvent.change(screen.getByLabelText(/where are you signing up/i), {
      target: { value: 'Netflix' },
    });
    fireEvent.click(screen.getByRole('button', { name: /create address/i }));

    expect(screen.getByTestId('site-address-netflix')).toHaveTextContent(
      'nova7.netflix@hide-mail.org'
    );
    expect(SiteAddressStore.list(MAILBOX)).toEqual(['netflix']);
  });

  it('copies a created address to the clipboard', () => {
    SiteAddressStore.add(MAILBOX, 'netflix');
    renderPanel();

    fireEvent.click(screen.getByRole('button', { name: /copy nova7.netflix@hide-mail.org/i }));

    expect(navigator.clipboard.writeText).toHaveBeenCalledWith('nova7.netflix@hide-mail.org');
  });

  it('will not create an address without a usable site name', () => {
    renderPanel();

    fireEvent.change(screen.getByLabelText(/where are you signing up/i), {
      target: { value: '***' },
    });

    expect(screen.getByRole('button', { name: /create address/i })).toBeDisabled();
  });

  it('counts the messages each site address has received', () => {
    SiteAddressStore.add(MAILBOX, 'netflix');
    renderPanel({
      messages: [
        { id: '1', deliveredTo: 'nova7.netflix@hide-mail.org' },
        { id: '2', deliveredTo: 'nova7.netflix@hide-mail.org' },
        { id: '3', deliveredTo: MAILBOX },
      ],
    });

    expect(screen.getByTestId('site-address-count-netflix')).toHaveTextContent('2');
  });

  it('lists an address a message arrived on even when it was never created here', () => {
    renderPanel({ messages: [{ id: '1', deliveredTo: 'nova7.shop@hide-mail.org' }] });

    expect(screen.getByTestId('site-address-shop')).toHaveTextContent('nova7.shop@hide-mail.org');
  });

  it('asks the inbox to filter on the address that was selected', () => {
    const onFilterChange = jest.fn();
    SiteAddressStore.add(MAILBOX, 'netflix');
    renderPanel({ onFilterChange });

    fireEvent.click(screen.getByRole('button', { name: /show only nova7.netflix@hide-mail.org/i }));

    expect(onFilterChange).toHaveBeenCalledWith('nova7.netflix@hide-mail.org');
  });

  it('clears the filter when the selected address is pressed again', () => {
    const onFilterChange = jest.fn();
    SiteAddressStore.add(MAILBOX, 'netflix');
    renderPanel({ onFilterChange, activeAddress: 'nova7.netflix@hide-mail.org' });

    fireEvent.click(screen.getByRole('button', { name: /show all messages/i }));

    expect(onFilterChange).toHaveBeenCalledWith(null);
  });

  it('forgets an address on request', () => {
    SiteAddressStore.add(MAILBOX, 'netflix');
    renderPanel();

    fireEvent.click(screen.getByRole('button', { name: /forget nova7.netflix@hide-mail.org/i }));

    expect(screen.queryByTestId('site-address-netflix')).not.toBeInTheDocument();
    expect(SiteAddressStore.list(MAILBOX)).toEqual([]);
  });

  it('renders nothing without a mailbox', () => {
    const { container } = render(
      <MemoryRouter>
        <SiteAddressPanel mailbox="" messages={[]} />
      </MemoryRouter>
    );

    expect(container).toBeEmptyDOMElement();
  });
});
