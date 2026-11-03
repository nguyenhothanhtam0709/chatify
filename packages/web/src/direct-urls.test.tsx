import { act, render, screen, waitFor, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { http, HttpResponse } from 'msw';
import { beforeEach, describe, expect, it } from 'vitest';
import { App } from './App';
import { fakeRealtime } from './test/fake-realtime';
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

const message = (body: string, senderId: string, sequence: number) => ({
  id: `0198a2b4-7c3e-7a52-9f31-5d2f4c1e${String(sequence).padStart(4, '0')}`,
  conversationId: withBob,
  senderId,
  sequence,
  clientMessageId: `0198a2b4-7c3e-7a52-9f31-5d2f4d1e${String(sequence).padStart(4, '0')}`,
  kind: 'text' as const,
  body,
  createdAt: '2020-03-04T10:00:00.000Z',
});

const summary = {
  id: withBob,
  kind: 'direct' as const,
  name: 'Bob',
  members: [aliceMember, bob],
  isMember: true,
  closed: false,
  unreadCount: 0,
  lastMessage: {
    sequence: 1,
    senderId: bob.id,
    preview: 'hello alice',
    createdAt: '2020-03-04T10:00:00Z',
  },
};

/**
 * Signed in as Alice. `existing` is whether she already has a Direct Conversation with Bob;
 * every request to the Conversation endpoints is recorded.
 */
function fakeApp({ existing }: { existing: boolean }) {
  const requests: string[] = [];
  const stored = existing ? [message('hello alice', bob.id, 1)] : [];
  server.use(
    http.post('*/api/v1/auth/refresh', () => HttpResponse.json({ accessToken: fakeAccessToken() })),
    http.get('*/api/v1/users/me', () => HttpResponse.json({ user: alice })),
    http.get('*/api/v1/users/search', () => HttpResponse.json({ users: [bob] })),
    http.get('*/api/v1/conversations', () =>
      HttpResponse.json({ conversations: existing ? [summary] : [] }),
    ),
    http.get(`*/api/v1/direct-conversations/${bob.id}`, ({ request }) => {
      requests.push(new URL(request.url).pathname);
      return HttpResponse.json({ peer: bob, ...(existing ? { conversationId: withBob } : {}) });
    }),
    http.get(`*/api/v1/conversations/${withBob}`, () =>
      HttpResponse.json({
        conversation: { id: withBob, kind: 'direct', members: [aliceMember, bob] },
      }),
    ),
    http.get(`*/api/v1/conversations/${withBob}/messages`, () =>
      HttpResponse.json({ messages: [...stored].reverse(), hasMore: false }),
    ),
    http.post('*/api/v1/direct-messages', async ({ request }) => {
      const body = (await request.json()) as { clientMessageId: string; body: string };
      const sent = { ...message(body.body, alice.id, 2), clientMessageId: body.clientMessageId };
      stored.push(sent);
      return HttpResponse.json(
        {
          message: sent,
          conversation: { id: withBob, kind: 'direct', memberIds: [alice.id, bob.id] },
        },
        { status: 201 },
      );
    }),
  );
  return { requests };
}

async function pickBob(user: ReturnType<typeof userEvent.setup>) {
  await user.click(await screen.findByRole('button', { name: /new conversation/i }));
  const dialog = await screen.findByRole('dialog', { name: /new conversation/i });
  await user.type(within(dialog).getByRole('combobox'), 'bo');
  await user.click(await within(dialog).findByRole('option', { name: /bobby/i }));
}

beforeEach(() => {
  window.history.pushState({}, '', '/');
});

describe('Direct URLs', () => {
  it('opens the existing Direct Conversation at its URL and shows its history', async () => {
    fakeApp({ existing: true });
    const user = userEvent.setup();
    render(<App />);

    await pickBob(user);

    expect(await screen.findAllByText('hello alice')).not.toHaveLength(0);
    await waitFor(() => expect(window.location.pathname).toBe(`/conversations/${withBob}`));
  });

  it('does not leave /direct/ in the history for an existing Conversation', async () => {
    fakeApp({ existing: true });
    const user = userEvent.setup();
    render(<App />);
    await pickBob(user);
    await waitFor(() => expect(window.location.pathname).toBe(`/conversations/${withBob}`));

    window.history.back();

    expect(await screen.findByText('Select a conversation to start chatting.')).toBeInTheDocument();
    expect(window.location.pathname).toBe('/');
  });

  it('shows "Say hello" at /direct/<userId> for a new Conversation, also after a reload', async () => {
    fakeApp({ existing: false });
    const user = userEvent.setup();
    const first = render(<App />);
    await pickBob(user);

    expect(await screen.findByText('No messages yet. Say hello to Bob.')).toBeInTheDocument();
    expect(window.location.pathname).toBe(`/direct/${bob.id}`);
    first.unmount();

    render(<App />);
    expect(await screen.findByText('No messages yet. Say hello to Bob.')).toBeInTheDocument();
    expect(screen.getByRole('heading', { name: 'Bob' })).toBeInTheDocument();
  });

  it('creates nothing by looking: the lookup is the only request before a send', async () => {
    const { requests } = fakeApp({ existing: false });
    window.history.pushState({}, '', `/direct/${bob.id}`);
    render(<App />);

    await screen.findByText('No messages yet. Say hello to Bob.');

    expect(requests).toEqual([`/api/v1/direct-conversations/${bob.id}`]);
  });

  it('replaces /direct/ with the Conversation after the first send, and Back skips it', async () => {
    fakeApp({ existing: false });
    const user = userEvent.setup();
    render(<App />);
    await pickBob(user);

    await user.type(await screen.findByRole('textbox', { name: 'Message' }), 'hi bob{Enter}');

    await waitFor(() => expect(window.location.pathname).toBe(`/conversations/${withBob}`));
    expect(await screen.findByText('hi bob')).toBeInTheDocument();

    window.history.back();
    expect(await screen.findByText('Select a conversation to start chatting.')).toBeInTheDocument();
    expect(window.location.pathname).toBe('/');
  });

  it('picking the same User again after the first send stays at the Conversation', async () => {
    fakeApp({ existing: false });
    const user = userEvent.setup();
    render(<App />);
    await pickBob(user);
    await user.type(await screen.findByRole('textbox', { name: 'Message' }), 'hi bob{Enter}');
    await waitFor(() => expect(window.location.pathname).toBe(`/conversations/${withBob}`));
    await screen.findByText('hi bob');

    await pickBob(user);

    await waitFor(() => expect(window.location.pathname).toBe(`/conversations/${withBob}`));
    expect(screen.getAllByText('hi bob').length).toBeGreaterThan(0);
    window.history.back();
    expect(await screen.findByText('Select a conversation to start chatting.')).toBeInTheDocument();
    expect(window.location.pathname).toBe('/');
  });

  it("replaces /direct/ with the Conversation when the other User's first Message arrives", async () => {
    fakeApp({ existing: false });
    const fake = fakeRealtime();
    window.history.pushState({}, '', `/direct/${bob.id}`);
    render(<App createRealtime={() => fake.realtime} />);
    await screen.findByText('No messages yet. Say hello to Bob.');

    act(() => fake.emit({ type: 'message.created', message: message('hey alice', bob.id, 1) }));

    await waitFor(() => expect(window.location.pathname).toBe(`/conversations/${withBob}`));
    expect(await screen.findByText('hey alice')).toBeInTheDocument();
  });

  it.each([
    ['an unknown User', bob.id, 404, 'USER_NOT_FOUND'],
    ['the caller', alice.id, 404, 'USER_NOT_FOUND'],
    ['a malformed id', 'not-a-uuid', 400, 'VALIDATION_FAILED'],
  ])(
    "says the user can't be found for %s, keeps the location and keeps the sidebar working",
    async (_name, id, status, code) => {
      fakeApp({ existing: true });
      server.use(
        http.get(`*/api/v1/direct-conversations/${id}`, () =>
          HttpResponse.json({ error: { code, message: 'x' } }, { status }),
        ),
      );
      window.history.pushState({}, '', `/direct/${id}`);
      const user = userEvent.setup();
      render(<App />);

      expect(await screen.findByText("This user can't be found.")).toBeInTheDocument();
      expect(window.location.pathname).toBe(`/direct/${id}`);

      await user.click(await screen.findByRole('button', { name: /Bob/ }));
      expect(await screen.findByRole('heading', { name: 'Bob' })).toBeInTheDocument();
      expect(window.location.pathname).toBe(`/conversations/${withBob}`);
    },
  );
});
