import { render, screen, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { http, HttpResponse } from 'msw';
import { beforeEach, describe, expect, it } from 'vitest';
import { App } from './App';
import { server } from './test/server';

const alice = {
  id: '0198a2b4-7c3e-7a52-9f31-5d2f4c1e8b60',
  username: 'Alice',
  email: 'alice@example.com',
  nickname: null,
  shareReadReceipts: true,
};
const aliceMember = { id: alice.id, username: alice.username, nickname: alice.nickname };
const bob = { id: '0198a2b4-7c3e-7a52-9f31-5d2f4c1e8b61', username: 'bobby', nickname: 'Bob' };
const withBob = '0198a2b4-7c3e-7a52-9f31-5d2f4c1e8b70';

function fakeAccessToken() {
  const encode = (value: object) => btoa(JSON.stringify(value)).replace(/=+$/, '');
  const exp = Math.floor(Date.now() / 1000) + 900;
  return `${encode({ alg: 'EdDSA' })}.${encode({ sub: alice.id, exp })}.signature`;
}

/** Signed out until Alice logs in; she has one Direct Conversation with Bob. */
function fakeApi() {
  const conversation = { id: withBob, kind: 'direct' as const, members: [aliceMember, bob] };
  server.use(
    http.post('*/api/v1/auth/login', () =>
      HttpResponse.json({ accessToken: fakeAccessToken(), user: alice }),
    ),
    http.get('*/api/v1/users/me', () => HttpResponse.json({ user: alice })),
    http.get('*/api/v1/conversations', () =>
      HttpResponse.json({
        conversations: [
          {
            ...conversation,
            name: bob.nickname,
            isMember: true,
            closed: false,
            unreadCount: 0,
            lastMessage: {
              sequence: 1,
              senderId: bob.id,
              preview: 'hi Alice',
              createdAt: '2020-03-04T10:00:00Z',
            },
          },
        ],
      }),
    ),
    http.get(`*/api/v1/conversations/${withBob}`, () => HttpResponse.json({ conversation })),
    http.get(`*/api/v1/conversations/${withBob}/messages`, () =>
      HttpResponse.json({
        messages: [
          {
            id: '0198a2b4-7c3e-7a52-9f31-5d2f4c1e0001',
            conversationId: withBob,
            senderId: bob.id,
            sequence: 1,
            clientMessageId: '0198a2b4-7c3e-7a52-9f31-5d2f4d1e0001',
            body: 'hi Alice',
            createdAt: '2020-03-04T10:00:00.000Z',
          },
        ],
        hasMore: false,
      }),
    ),
    http.put('*/api/v1/conversations/:id/read', () => HttpResponse.json({ upToSequence: 1 })),
  );
}

async function logIn() {
  const user = userEvent.setup();
  await user.type(await screen.findByLabelText(/username or email/i), 'alice');
  await user.type(screen.getByLabelText(/password/i), 'correct horse battery');
  await user.click(screen.getByRole('button', { name: /^log ?in$/i }));
}

beforeEach(() => {
  window.history.pushState({}, '', '/');
});

describe('return after login', () => {
  it('sends a signed-out visitor from a Conversation link to login, then on to that Conversation', async () => {
    fakeApi();
    window.history.pushState({}, '', '/start');
    window.history.pushState({}, '', `/conversations/${withBob}?from=mail`);
    render(<App />);

    await screen.findByLabelText(/username or email/i);
    expect(window.location.pathname).toBe('/login');
    expect(window.location.search).toBe('');
    expect(window.location.href).not.toContain(withBob);

    await logIn();

    expect(await screen.findByRole('heading', { name: 'Bob' })).toBeInTheDocument();
    expect(window.location.pathname).toBe(`/conversations/${withBob}`);
    expect(window.location.search).toBe('?from=mail');
    expect(await screen.findAllByText('hi Alice')).not.toHaveLength(0);

    window.history.back();
    await waitFor(() => expect(window.location.pathname).toBe('/start'));
    expect(screen.queryByLabelText(/username or email/i)).not.toBeInTheDocument();
  });

  it.each([
    'https://evil.example/conversations',
    '//evil.example/conversations',
    '/\\evil.example/conversations',
    'javascript:alert(1)',
    '/login',
    '/signup?x=1',
    42,
  ])('ignores the remembered location %s and lands on /', async (returnTo) => {
    fakeApi();
    const origin = window.location.origin;
    // React Router keeps location state under `usr` in the history entry.
    window.history.pushState({ usr: { returnTo } }, '', '/login');
    render(<App />);

    await logIn();

    expect(await screen.findByText('Select a conversation to start chatting.')).toBeInTheDocument();
    expect(window.location.pathname).toBe('/');
    expect(window.location.origin).toBe(origin);
  });

  it('keeps the remembered location out of the URL when moving from login to signup', async () => {
    fakeApi();
    window.history.pushState({}, '', `/conversations/${withBob}?from=mail`);
    const user = userEvent.setup();
    render(<App />);

    await user.click(await screen.findByRole('link', { name: /sign up/i }));

    expect(await screen.findByRole('button', { name: /create account/i })).toBeInTheDocument();
    expect(window.location.pathname).toBe('/signup');
    expect(window.location.search).toBe('');
    expect(window.location.href).not.toContain(withBob);
  });

  it('carries the remembered location through signup and back to login, then on to the Conversation', async () => {
    fakeApi();
    server.use(
      http.post('*/api/v1/auth/register', () =>
        HttpResponse.json({ user: alice }, { status: 201 }),
      ),
    );
    window.history.pushState({}, '', '/start');
    window.history.pushState({}, '', `/conversations/${withBob}?from=mail`);
    const user = userEvent.setup();
    render(<App />);

    await user.click(await screen.findByRole('link', { name: /sign up/i }));
    await user.type(await screen.findByLabelText(/username/i), 'Alice');
    await user.type(screen.getByLabelText(/email/i), 'alice@example.com');
    await user.type(screen.getByLabelText(/password/i), 'correct horse battery');
    await user.click(screen.getByRole('button', { name: /create account/i }));
    await screen.findByText(/account created/i);

    await user.click(screen.getByRole('link', { name: /log ?in/i }));
    expect(window.location.pathname).toBe('/login');
    expect(window.location.search).toBe('');
    await logIn();

    expect(await screen.findByRole('heading', { name: 'Bob' })).toBeInTheDocument();
    expect(window.location.pathname).toBe(`/conversations/${withBob}`);
    expect(window.location.search).toBe('?from=mail');

    window.history.back();
    await waitFor(() => expect(window.location.pathname).toBe('/start'));
  });

  it('offers a plain Log in link after signing up with no remembered location, landing on /', async () => {
    fakeApi();
    server.use(
      http.post('*/api/v1/auth/register', () =>
        HttpResponse.json({ user: alice }, { status: 201 }),
      ),
    );
    window.history.pushState({}, '', '/signup');
    const user = userEvent.setup();
    render(<App />);

    await user.type(await screen.findByLabelText(/username/i), 'Alice');
    await user.type(screen.getByLabelText(/email/i), 'alice@example.com');
    await user.type(screen.getByLabelText(/password/i), 'correct horse battery');
    await user.click(screen.getByRole('button', { name: /create account/i }));
    await user.click(await screen.findByRole('link', { name: /log ?in/i }));
    await logIn();

    expect(await screen.findByText('Select a conversation to start chatting.')).toBeInTheDocument();
    expect(window.location.pathname).toBe('/');
  });
});
