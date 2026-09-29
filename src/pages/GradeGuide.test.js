import React from 'react';
import { MemoryRouter } from 'react-router';
import { render, screen } from '@testing-library/react';
import GradeGuide from './GradeGuide';

describe('GradeGuide page', () => {
  test('lists finding entries with cause and fix', () => {
    render(
      <MemoryRouter>
        <GradeGuide />
      </MemoryRouter>
    );

    expect(screen.getByRole('heading', { name: 'Mail Grade findings guide' })).toBeInTheDocument();
    expect(screen.getByRole('heading', { name: 'Missing From' })).toBeInTheDocument();
    expect(screen.getByText(/Add a From header with a real mailbox/i)).toBeInTheDocument();
    expect(screen.getByRole('link', { name: /Mail Grade/i })).toHaveAttribute('href', '/grade');
  });
});
