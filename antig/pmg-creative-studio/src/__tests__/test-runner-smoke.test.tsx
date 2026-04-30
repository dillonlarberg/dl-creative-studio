import { describe, expect, it } from 'vitest';
import { render, screen } from '@testing-library/react';

describe('test runner smoke test', () => {
  it('renders a React component into jsdom', () => {
    render(<h1>hello vitest</h1>);
    expect(screen.getByRole('heading', { level: 1 })).toBeInTheDocument();
    expect(screen.getByRole('heading', { level: 1 })).toHaveTextContent('hello vitest');
  });
});
