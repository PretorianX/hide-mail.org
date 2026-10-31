import React from 'react';
import { readFileSync } from 'fs';
import { MemoryRouter } from 'react-router';
import { render, screen, fireEvent } from '@testing-library/react';
import Invites from './Invites';
import InviteService from '../services/InviteService';

const inviteCss = readFileSync(require.resolve('./Invites.css'), 'utf8');

jest.mock('../services/InviteService', () => ({
  read: jest.fn(),
  loadOffer: jest.fn(),
  getKey: jest.fn(),
  validate: jest.fn(),
  fetchHandoff: jest.fn(),
  requestApiKey: jest.fn(),
  clearKey: jest.fn(),
}));

jest.mock('../services/LicenseService', () => ({
  checkout: jest.fn(),
  submitWayforpayCheckout: jest.fn(),
}));

const renderInvites = () => render(
  <MemoryRouter>
    <Invites />
  </MemoryRouter>
);

const meeting = {
  stored: false,
  stamp: 'REQUEST',
  kind: 'request',
  summary: 'Design review',
  when: {
    month: 'NOV',
    day: '12',
    year: 2026,
    allDay: false,
    timeLabel: '15:00–15:30 UTC',
    timezone: 'UTC',
  },
  organizer: { name: 'Ada Lovelace', email: 'ada@lab.example' },
  attendees: [
    { name: 'Grace Hopper', email: 'grace@navy.example', partstat: 'ACCEPTED', role: 'REQ-PARTICIPANT' },
  ],
  location: 'Lab 3',
  url: null,
  sequence: 0,
  additionalEvents: 0,
  warnings: [],
};

describe('Invite Read page', () => {
  beforeEach(() => {
    InviteService.read.mockReset();
    InviteService.loadOffer.mockResolvedValue({
      name: 'Invite Read API',
      type: 'invite',
      plan: 'monthly',
      usd: 24,
      checkoutPaused: true,
      endpoint: 'POST /api/invite-read',
    });
    InviteService.getKey.mockReturnValue(null);
  });

  test('the header link is the same plain nav treatment, and the page keeps a focus ring', () => {
    expect(inviteCss).toMatch(/\.invite-page textarea:focus-visible[\s\S]*outline: 3px solid var\(--duck-orange\)/);
    expect(inviteCss).toMatch(/@media \(max-width: 640px\)[\s\S]*\.invite-stub \{[\s\S]*flex-wrap: wrap/);
    expect(inviteCss).toMatch(/body\[data-theme='dark'\] \.invite-page textarea[\s\S]*-webkit-text-fill-color: #e0e0e0/);
  });

  test('starts empty, with the meeting stub waiting and one primary action', async () => {
    renderInvites();

    expect(screen.getByRole('heading', { name: 'Invite Read' })).toBeInTheDocument();
    expect(screen.getByTestId('invite-date')).toHaveTextContent('—');
    expect(screen.getByTestId('invite-date')).not.toHaveTextContent('12');
    expect(screen.getByTestId('invite-stub')).toHaveTextContent(/who invited you, and when/i);
    expect(screen.getByTestId('invite-empty')).toHaveTextContent(/nothing you paste is stored/i);
    expect(screen.getByRole('button', { name: 'Read invite' })).toBeEnabled();
    expect(screen.queryByTestId('invite-result')).not.toBeInTheDocument();
    expect(await screen.findByRole('button', { name: 'Buy the Invite Read API' })).toBeDisabled();
  });

  test('fills the meeting stub after the primary action', async () => {
    InviteService.read.mockResolvedValue(meeting);
    renderInvites();

    fireEvent.change(screen.getByLabelText('Meeting request'), {
      target: { value: 'BEGIN:VCALENDAR' },
    });
    fireEvent.click(screen.getByRole('button', { name: 'Read invite' }));

    expect(await screen.findByTestId('invite-stamp')).toHaveTextContent('REQUEST');
    expect(screen.getByTestId('invite-date')).toHaveTextContent('NOV');
    expect(screen.getByTestId('invite-date')).toHaveTextContent('12');
    expect(screen.getByTestId('invite-stub')).toHaveTextContent('Design review');
    expect(screen.getByTestId('invite-stub')).toHaveTextContent('Ada Lovelace');
    expect(screen.getByTestId('invite-result')).toHaveTextContent('Grace Hopper — Accepted');
    expect(screen.getByTestId('invite-result')).toHaveTextContent('Lab 3');
  });

  test('shows an error and clears the stub when the paste is not a meeting', async () => {
    InviteService.read.mockRejectedValue(new Error('That paste is not a calendar request.'));
    renderInvites();

    fireEvent.change(screen.getByLabelText('Meeting request'), {
      target: { value: 'Hello' },
    });
    fireEvent.click(screen.getByRole('button', { name: 'Read invite' }));

    const alert = await screen.findByRole('alert');
    expect(alert).toHaveTextContent('That paste is not a calendar request.');
    expect(screen.getByTestId('invite-date')).toHaveTextContent('—');
    expect(screen.queryByTestId('invite-result')).not.toBeInTheDocument();
    expect(screen.getByLabelText('Meeting request')).toHaveAttribute('aria-invalid', 'true');
  });

  test('asks for a paste before calling the reader', async () => {
    renderInvites();

    fireEvent.click(screen.getByRole('button', { name: 'Read invite' }));

    expect(await screen.findByRole('alert')).toHaveTextContent('Paste a meeting request first.');
    expect(InviteService.read).not.toHaveBeenCalled();
  });
});
