import { render, screen, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { http, HttpResponse } from 'msw';
import { beforeEach, describe, expect, it } from 'vitest';
import { App } from './App';
import { server } from './test/server';

const USER_ID = '0198a2b4-7c3e-7a52-9f31-5d2f4c1e8b60';

interface Captured {
  bodies: unknown[];
}

function mockRegister(respond: (body: Record<string, unknown>) => Response): Captured {
  const captured: Captured = { bodies: [] };
  server.use(
    http.post('*/api/v1/auth/register', async ({ request }) => {
      const body = (await request.json()) as Record<string, unknown>;
      captured.bodies.push(body);
      return respond(body);
    }),
  );
  return captured;
}

function errorResponse(status: number, code: string, details?: unknown) {
  return HttpResponse.json({ error: { code, message: code, details } }, { status });
}

async function fill(
  fields: Partial<Record<'Username' | 'Email' | 'Password' | 'Nickname', string>>,
) {
  const user = userEvent.setup();
  for (const [label, value] of Object.entries(fields)) {
    await user.type(screen.getByLabelText(new RegExp(label, 'i')), value);
  }
  return user;
}

beforeEach(() => {
  window.history.pushState({}, '', '/signup');
});

describe('signup page', () => {
  it('registers a visitor and shows the result', async () => {
    const captured = mockRegister((body) =>
      HttpResponse.json(
        {
          user: {
            id: USER_ID,
            username: body['username'],
            email: body['email'],
            nickname: body['nickname'] ?? null,
            shareReadReceipts: true,
          },
        },
        { status: 201 },
      ),
    );
    render(<App />);

    const user = await fill({
      Username: 'Alice',
      Email: 'alice@example.com',
      Password: 'correct horse battery',
      Nickname: 'Ali',
    });
    await user.click(screen.getByRole('button', { name: /create account/i }));

    expect(await screen.findByText(/account created/i)).toBeInTheDocument();
    expect(screen.getByText(/Alice/)).toBeInTheDocument();
    expect(captured.bodies).toEqual([
      {
        username: 'Alice',
        email: 'alice@example.com',
        password: 'correct horse battery',
        nickname: 'Ali',
      },
    ]);
  });

  it('omits an empty Nickname from the request', async () => {
    const captured = mockRegister((body) =>
      HttpResponse.json(
        {
          user: {
            id: USER_ID,
            username: body['username'],
            email: body['email'],
            nickname: null,
            shareReadReceipts: true,
          },
        },
        { status: 201 },
      ),
    );
    render(<App />);

    const user = await fill({
      Username: 'Alice',
      Email: 'alice@example.com',
      Password: 'correct horse battery',
    });
    await user.click(screen.getByRole('button', { name: /create account/i }));

    await screen.findByText(/account created/i);
    expect(captured.bodies[0]).not.toHaveProperty('nickname');
  });

  it('shows a taken Username as an error on the Username field', async () => {
    mockRegister(() => errorResponse(409, 'USERNAME_TAKEN'));
    render(<App />);

    const user = await fill({
      Username: 'alice',
      Email: 'alice@example.com',
      Password: 'correct horse battery',
    });
    await user.click(screen.getByRole('button', { name: /create account/i }));

    const username = screen.getByLabelText(/username/i);
    await waitFor(() => expect(username).toHaveAttribute('aria-invalid', 'true'));
    expect(screen.getByRole('alert')).toHaveTextContent(/username.*taken/i);
    expect(username.closest('[data-slot="field"]')).toHaveAttribute('data-invalid', 'true');
    expect(screen.getByLabelText(/email/i)).not.toHaveAttribute('aria-invalid', 'true');
    expect(screen.queryByText(/account created/i)).not.toBeInTheDocument();
  });

  it('shows a registered email as an error on the Email field', async () => {
    mockRegister(() => errorResponse(409, 'EMAIL_TAKEN'));
    render(<App />);

    const user = await fill({
      Username: 'alice',
      Email: 'alice@example.com',
      Password: 'correct horse battery',
    });
    await user.click(screen.getByRole('button', { name: /create account/i }));

    const email = screen.getByLabelText(/email/i);
    await waitFor(() => expect(email).toHaveAttribute('aria-invalid', 'true'));
    expect(screen.getByLabelText(/username/i)).not.toHaveAttribute('aria-invalid', 'true');
  });

  it('explains invalid input field by field from the shared schema, without calling the API', async () => {
    const captured = mockRegister(() => errorResponse(500, 'INTERNAL_ERROR'));
    render(<App />);

    const user = await fill({ Username: 'a b', Email: 'nope', Password: 'short' });
    await user.click(screen.getByRole('button', { name: /create account/i }));

    await waitFor(() =>
      expect(screen.getByLabelText(/username/i)).toHaveAttribute('aria-invalid', 'true'),
    );
    expect(screen.getByLabelText(/email/i)).toHaveAttribute('aria-invalid', 'true');
    expect(screen.getByLabelText(/password/i)).toHaveAttribute('aria-invalid', 'true');
    expect(screen.getByLabelText(/nickname/i)).not.toHaveAttribute('aria-invalid', 'true');
    expect(screen.getAllByRole('alert')).toHaveLength(3);
    expect(captured.bodies).toHaveLength(0);
  });

  it('maps API validation details onto the matching fields', async () => {
    mockRegister(() =>
      errorResponse(400, 'VALIDATION_FAILED', [
        { path: ['nickname'], message: 'must be 1-50 characters', code: 'custom' },
      ]),
    );
    render(<App />);

    const user = await fill({
      Username: 'alice',
      Email: 'alice@example.com',
      Password: 'correct horse battery',
    });
    await user.click(screen.getByRole('button', { name: /create account/i }));

    await waitFor(() =>
      expect(screen.getByLabelText(/nickname/i)).toHaveAttribute('aria-invalid', 'true'),
    );
    expect(screen.getByRole('alert')).toHaveTextContent('must be 1-50 characters');
  });

  it('tells the visitor when too many registrations were attempted', async () => {
    mockRegister(() => errorResponse(429, 'RATE_LIMITED'));
    render(<App />);

    const user = await fill({
      Username: 'alice',
      Email: 'alice@example.com',
      Password: 'correct horse battery',
    });
    await user.click(screen.getByRole('button', { name: /create account/i }));

    expect(await screen.findByRole('alert')).toHaveTextContent(/too many/i);
  });

  it('offers no social sign-up or extra links', () => {
    render(<App />);

    expect(screen.queryByRole('link')).not.toBeInTheDocument();
    expect(screen.queryByText(/google/i)).not.toBeInTheDocument();
    expect(screen.queryByLabelText(/confirm/i)).not.toBeInTheDocument();
  });
});
