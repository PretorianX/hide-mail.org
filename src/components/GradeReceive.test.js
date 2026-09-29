import React from 'react';
import { render, screen, fireEvent, waitFor, act } from '@testing-library/react';
import GradeReceive from './GradeReceive';
import GradeInboxService from '../services/GradeInboxService';

jest.mock('../services/GradeInboxService', () => ({
  getStoredAddress: jest.fn(),
  createAddress: jest.fn(),
  listMessages: jest.fn(),
  getRawSource: jest.fn(),
}));

describe('GradeReceive', () => {
  beforeEach(() => {
    jest.useFakeTimers();
    GradeInboxService.getStoredAddress.mockReturnValue(null);
    GradeInboxService.createAddress.mockReset();
    GradeInboxService.listMessages.mockReset();
    GradeInboxService.getRawSource.mockReset();
  });

  afterEach(() => {
    jest.useRealTimers();
  });

  test('mints an address and grades inbound mail', async () => {
    const onSourceReady = jest.fn();
    GradeInboxService.createAddress.mockResolvedValue('grade-abc@hide-mail.org');
    GradeInboxService.listMessages
      .mockResolvedValueOnce([])
      .mockResolvedValueOnce([{ id: 'msg-1', subject: 'Test send' }]);
    GradeInboxService.getRawSource.mockResolvedValue(
      'From: a@b.com\nSubject: Test send\n\nHello'
    );

    render(<GradeReceive onSourceReady={onSourceReady} />);

    fireEvent.click(screen.getByRole('button', { name: 'Create Mail Grade address' }));

    expect(await screen.findByTestId('grade-receive-address')).toHaveValue(
      'grade-abc@hide-mail.org'
    );
    expect(screen.getByTestId('grade-receive-status')).toHaveTextContent(/Waiting/i);

    await act(async () => {
      jest.advanceTimersByTime(3000);
    });

    await waitFor(() => {
      expect(onSourceReady).toHaveBeenCalledWith(expect.stringContaining('Subject: Test send'));
    });
    expect(screen.getByTestId('grade-receive-status')).toHaveTextContent(/Received/);
  });
});
