import { describe, expect, it, vi, beforeEach } from 'vitest';
import { render, screen, waitFor } from '@testing-library/react';
import { MemoryRouter, Route, Routes } from 'react-router-dom';
import { ClientProvider } from '../ClientProvider';
import { useCurrentClient } from '../useCurrentClient';
import * as alliService from '@/services/alli';

vi.mock('@/services/alli', () => ({
  alliService: {
    getClients: vi.fn(),
  },
}));

function ProbeComponent() {
  const ctx = useCurrentClient();
  if (ctx.isLoading) return <p>loading</p>;
  if (ctx.error) return <p>error: {ctx.error}</p>;
  if (!ctx.currentClient) return <p>no client</p>;
  return <p>client: {ctx.currentClient.slug}</p>;
}

const allowed = [
  { slug: 'ralph_lauren', name: 'Ralph Lauren', id: 'rl-1' },
  { slug: 'sharkninja', name: 'Shark Ninja', id: 'sn-1' },
];

beforeEach(() => {
  vi.clearAllMocks();
});

describe('ClientProvider', () => {
  it('renders loading state while Alli /clients resolves', () => {
    vi.mocked(alliService.alliService.getClients).mockReturnValue(new Promise(() => {}));
    render(
      <MemoryRouter initialEntries={['/ralph_lauren']}>
        <Routes>
          <Route
            path="/:clientSlug"
            element={
              <ClientProvider>
                <ProbeComponent />
              </ClientProvider>
            }
          />
        </Routes>
      </MemoryRouter>
    );
    expect(screen.getByText('loading')).toBeInTheDocument();
  });

  it('exposes currentClient when URL slug is in the user-allowed list', async () => {
    vi.mocked(alliService.alliService.getClients).mockResolvedValue(allowed);
    render(
      <MemoryRouter initialEntries={['/ralph_lauren']}>
        <Routes>
          <Route
            path="/:clientSlug"
            element={
              <ClientProvider>
                <ProbeComponent />
              </ClientProvider>
            }
          />
        </Routes>
      </MemoryRouter>
    );
    await waitFor(() => expect(screen.getByText('client: ralph_lauren')).toBeInTheDocument());
  });

  it('surfaces an error when URL slug is NOT in the user-allowed list', async () => {
    vi.mocked(alliService.alliService.getClients).mockResolvedValue(allowed);
    render(
      <MemoryRouter initialEntries={['/apple_services']}>
        <Routes>
          <Route
            path="/:clientSlug"
            element={
              <ClientProvider>
                <ProbeComponent />
              </ClientProvider>
            }
          />
        </Routes>
      </MemoryRouter>
    );
    await waitFor(() => expect(screen.getByText(/error:/)).toBeInTheDocument());
  });

  it('surfaces an error when Alli /clients fails', async () => {
    vi.mocked(alliService.alliService.getClients).mockRejectedValue(new Error('alli down'));
    render(
      <MemoryRouter initialEntries={['/ralph_lauren']}>
        <Routes>
          <Route
            path="/:clientSlug"
            element={
              <ClientProvider>
                <ProbeComponent />
              </ClientProvider>
            }
          />
        </Routes>
      </MemoryRouter>
    );
    await waitFor(() => expect(screen.getByText(/error:/)).toBeInTheDocument());
  });
});
