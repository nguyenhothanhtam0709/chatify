import { fireEvent, render, screen, waitFor, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { delay, http, HttpResponse } from 'msw';
import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import { App } from './App';
import { server } from './test/server';
import { ITEM_HEIGHT, VIEWPORT_HEIGHT, stubLayout, unstubLayout } from './test/layout';

const alice = {
  id: '0198a2b4-7c3e-7a52-9f31-5d2f4c1e8b60',
  username: 'Alice',
  email: 'alice@example.com',
  nickname: null,
  shareReadReceipts: true,
};
const aliceMember = { id: alice.id, username: alice.username, nickname: alice.nickname };
const bob = { id: '0198a2b4-7c3e-7a52-9f31-5d2f4c1e8b61', username: 'bobby', nickname: 'Bob' };
const carol = { id: '0198a2b4-7c3e-7a52-9f31-5d2f4c1e8b62', username: 'carol', nickname: 'Carol' };
const withBob = '0198a2b4-7c3e-7a52-9f31-5d2f4c1e8b70';
const withCarol = '0198a2b4-7c3e-7a52-9f31-5d2f4c1e8b71';
const bookClub = '0198a2b4-7c3e-7a52-9f31-5d2f4c1e8b80';

const TOTAL = 25;
const FIRST_PAGE_END = 10 * ITEM_HEIGHT - VIEWPORT_HEIGHT;

function fakeAccessToken() {
  const encode = (value: object) => btoa(JSON.stringify(value)).replace(/=+$/, '');
  const exp = Math.floor(Date.now() / 1000) + 900;
  return `${encode({ alg: 'EdDSA' })}.${encode({ sub: alice.id, exp })}.signature`;
}

interface Fake {
  id: string;
  label: string;
  total: number;
}

const direct = (id: string, peer: typeof bob) => ({
  id,
  kind: 'direct' as const,
  members: [aliceMember, peer],
});

const directSummary = (id: string, peer: typeof bob, total: number) => ({
  ...direct(id, peer),
  name: peer.nickname,
  isMember: true,
  closed: false,
  unreadCount: 0,
  lastMessage: {
    sequence: total,
    senderId: peer.id,
    preview: `${peer.nickname} says ${total}`,
    createdAt: '2020-03-04T10:00:00Z',
  },
});

const groupDetail = (isMember: boolean, closed = false) => ({
  id: bookClub,
  kind: 'group' as const,
  name: 'Book Club',
  ownerId: alice.id,
  members: isMember ? [aliceMember, bob] : [],
  closed,
  isMember,
});

const row = (conversation: Fake, sequence: number, senderId = bob.id) => ({
  id: `0198a2b4-7c3e-7a52-9f31-5d2f4c1e${String(sequence).padStart(4, '0')}`,
  conversationId: conversation.id,
  senderId,
  sequence,
  clientMessageId: `0198a2b4-7c3e-7a52-9f31-5d2f4d1e${String(sequence).padStart(4, '0')}`,
  body: `${conversation.label} ${sequence}`,
  createdAt: '2020-03-04T10:00:00.000Z',
});

const bobFake: Fake = { id: withBob, label: 'bob says', total: TOTAL };
const carolFake: Fake = { id: withCarol, label: 'carol says', total: 3 };

/**
 * Signed in as Alice with a Bob and a Carol Conversation. `listDelay` holds the Conversation
 * list back, to open a URL before its entry exists. Mark-reads are recorded.
 */
function fakeApp({
  listDelay = 0,
  list = [directSummary(withBob, bob, TOTAL), directSummary(withCarol, carol, 3)],
}: { listDelay?: number; list?: unknown[] } = {}) {
  const marked: Array<{ id: string; upToSequence: number }> = [];
  const messagesHandler = (conversation: Fake) =>
    http.get(`*/api/v1/conversations/${conversation.id}/messages`, ({ request }) => {
      const params = new URL(request.url).searchParams;
      const limit = Number(params.get('limit') ?? 10);
      const before = Number(params.get('before') ?? conversation.total + 1);
      const older = Array.from({ length: before - 1 }, (_, i) => before - 1 - i);
      return HttpResponse.json({
        messages: older.slice(0, limit).map((n) => row(conversation, n)),
        hasMore: older.length > limit,
      });
    });
  server.use(
    http.post('*/api/v1/auth/refresh', () => HttpResponse.json({ accessToken: fakeAccessToken() })),
    http.get('*/api/v1/users/me', () => HttpResponse.json({ user: alice })),
    http.get('*/api/v1/users/search', () => HttpResponse.json({ users: [bob] })),
    http.get('*/api/v1/conversations', async () => {
      if (listDelay > 0) await delay(listDelay);
      return HttpResponse.json({ conversations: list });
    }),
    http.get(`*/api/v1/conversations/${withBob}`, () =>
      HttpResponse.json({ conversation: direct(withBob, bob) }),
    ),
    http.get(`*/api/v1/conversations/${withCarol}`, () =>
      HttpResponse.json({ conversation: direct(withCarol, carol) }),
    ),
    messagesHandler(bobFake),
    messagesHandler(carolFake),
    http.put('*/api/v1/conversations/:id/read', async ({ request, params }) => {
      const { upToSequence } = (await request.json()) as { upToSequence: number };
      marked.push({ id: String(params['id']), upToSequence });
      return HttpResponse.json({ upToSequence });
    }),
  );
  return { marked };
}

const notFound = () =>
  HttpResponse.json(
    { error: { code: 'CONVERSATION_NOT_FOUND', message: 'No such conversation' } },
    { status: 404 },
  );

async function expectAtLiveEdge(viewport: HTMLElement) {
  fireEvent.scroll(viewport);
  await waitFor(() =>
    expect(screen.getByRole('button', { name: /jump to latest/i })).toHaveAttribute(
      'data-active',
      'false',
    ),
  );
}

beforeEach(() => {
  window.history.pushState({}, '', '/');
  stubLayout();
});

afterEach(() => {
  unstubLayout();
});

describe('Conversation URLs', () => {
  it('moves the location to the Conversation clicked, and clicking it again adds no entry', async () => {
    fakeApp();
    const user = userEvent.setup();
    render(<App />);

    await user.click(await screen.findByRole('button', { name: /Bob/ }));
    await screen.findByRole('heading', { name: 'Bob' });
    expect(window.location.pathname).toBe(`/conversations/${withBob}`);

    const entries = window.history.length;
    await user.click(screen.getByRole('button', { name: /Bob/ }));
    expect(window.history.length).toBe(entries);
    expect(window.location.pathname).toBe(`/conversations/${withBob}`);
  });

  it('steps Back and Forward between Conversations, and Back past the first shows the empty state', async () => {
    fakeApp();
    const user = userEvent.setup();
    render(<App />);

    await user.click(await screen.findByRole('button', { name: /Bob/ }));
    await screen.findByRole('heading', { name: 'Bob' });
    await user.click(screen.getByRole('button', { name: /Carol/ }));
    await screen.findByRole('heading', { name: 'Carol' });

    window.history.back();
    await screen.findByRole('heading', { name: 'Bob' });
    expect(window.location.pathname).toBe(`/conversations/${withBob}`);

    window.history.forward();
    await screen.findByRole('heading', { name: 'Carol' });

    window.history.back();
    await screen.findByRole('heading', { name: 'Bob' });
    window.history.back();
    expect(await screen.findByText('Select a conversation to start chatting.')).toBeInTheDocument();
    expect(window.location.pathname).toBe('/');
  });

  it('lands a long Conversation opened from its URL at the newest Message', async () => {
    fakeApp();
    window.history.pushState({}, '', `/conversations/${withBob}`);
    render(<App />);

    const viewport = await screen.findByRole('region', { name: /messages/i });
    await screen.findAllByText('bob says 25');

    await waitFor(() => expect(viewport.scrollTop).toBe(FIRST_PAGE_END));
    await expectAtLiveEdge(viewport);
  });

  it('lands a long Conversation at the newest Message again after a reload', async () => {
    fakeApp();
    const user = userEvent.setup();
    const first = render(<App />);
    await user.click(await screen.findByRole('button', { name: /Bob/ }));
    await screen.findAllByText('bob says 25');
    first.unmount();

    render(<App />);
    const viewport = await screen.findByRole('region', { name: /messages/i });
    await screen.findAllByText('bob says 25');

    await waitFor(() => expect(viewport.scrollTop).toBe(FIRST_PAGE_END));
    await expectAtLiveEdge(viewport);
  });

  it("shows the other User's name before the Conversation list has loaded", async () => {
    fakeApp({ listDelay: 400 });
    window.history.pushState({}, '', `/conversations/${withBob}`);
    render(<App />);

    expect(await screen.findByRole('heading', { name: 'Bob' })).toBeInTheDocument();
    expect(screen.queryByRole('button', { name: /Bob/ })).not.toBeInTheDocument();
  });

  it('shows a Group opened from its URL before its list entry loads, and moves its Read Marker', async () => {
    const { marked } = fakeApp({ listDelay: 400 });
    const bookFake: Fake = { id: bookClub, label: 'club says', total: 3 };
    server.use(
      http.get(`*/api/v1/conversations/${bookClub}`, () =>
        HttpResponse.json({ conversation: groupDetail(true) }),
      ),
      http.get(`*/api/v1/conversations/${bookClub}/messages`, () =>
        HttpResponse.json({
          messages: [3, 2, 1].map((n) => row(bookFake, n)),
          hasMore: false,
        }),
      ),
    );
    window.history.pushState({}, '', `/conversations/${bookClub}`);
    render(<App />);

    expect(await screen.findByRole('heading', { name: 'Book Club' })).toBeInTheDocument();
    await waitFor(() => expect(marked).toContainEqual({ id: bookClub, upToSequence: 3 }));
  });

  it('opens the new Group at its URL after creating it', async () => {
    fakeApp({ list: [] });
    server.use(
      http.post('*/api/v1/groups', () =>
        HttpResponse.json({ conversation: groupDetail(true) }, { status: 201 }),
      ),
      http.get(`*/api/v1/conversations/${bookClub}`, () =>
        HttpResponse.json({ conversation: groupDetail(true) }),
      ),
      http.get(`*/api/v1/conversations/${bookClub}/messages`, () =>
        HttpResponse.json({ messages: [], hasMore: false }),
      ),
    );
    const user = userEvent.setup();
    render(<App />);
    await screen.findByText(/no conversations yet/i, undefined, { timeout: 4000 });

    await user.click(screen.getByRole('button', { name: /new group/i }));
    const dialog = await screen.findByRole('dialog', { name: /new group/i });
    await user.type(within(dialog).getByRole('textbox', { name: /group name/i }), 'Book Club');
    await user.click(within(dialog).getByRole('button', { name: /create group/i }));

    await screen.findByRole('heading', { name: 'Book Club' });
    expect(window.location.pathname).toBe(`/conversations/${bookClub}`);
  });

  it('opens a Group the User left from its URL, read-only', async () => {
    fakeApp();
    server.use(
      http.get(`*/api/v1/conversations/${bookClub}`, () =>
        HttpResponse.json({ conversation: groupDetail(false) }),
      ),
      http.get(`*/api/v1/conversations/${bookClub}/messages`, () =>
        HttpResponse.json({ messages: [], hasMore: false }),
      ),
    );
    window.history.pushState({}, '', `/conversations/${bookClub}`);
    render(<App />);

    expect(await screen.findByRole('heading', { name: 'Book Club' })).toBeInTheDocument();
    expect(await screen.findByText(/no longer a member/i)).toBeInTheDocument();
    expect(screen.queryByRole('textbox', { name: /message/i })).not.toBeInTheDocument();
  });

  it('opens a Closed Group from its URL, read-only', async () => {
    fakeApp();
    server.use(
      http.get(`*/api/v1/conversations/${bookClub}`, () =>
        HttpResponse.json({ conversation: groupDetail(false, true) }),
      ),
      http.get(`*/api/v1/conversations/${bookClub}/messages`, () =>
        HttpResponse.json({ messages: [], hasMore: false }),
      ),
    );
    window.history.pushState({}, '', `/conversations/${bookClub}`);
    render(<App />);

    expect(await screen.findByText(/this group is closed/i)).toBeInTheDocument();
    expect(screen.queryByRole('textbox', { name: /message/i })).not.toBeInTheDocument();
  });

  it.each([
    ["a Conversation that does not exist or is not the User's", `${bookClub}`, notFound],
    [
      'a malformed id',
      'not-a-uuid',
      () =>
        HttpResponse.json(
          { error: { code: 'VALIDATION_FAILED', message: 'Invalid id' } },
          { status: 400 },
        ),
    ],
  ])(
    'says so for %s, keeps the location and keeps the sidebar working',
    async (_name, id, answer) => {
      fakeApp();
      server.use(http.get(`*/api/v1/conversations/${id}`, answer));
      window.history.pushState({}, '', `/conversations/${id}`);
      const user = userEvent.setup();
      render(<App />);

      expect(
        await screen.findByText("This conversation doesn't exist or you don't have access to it."),
      ).toBeInTheDocument();
      expect(window.location.pathname).toBe(`/conversations/${id}`);

      await user.click(await screen.findByRole('button', { name: /Bob/ }));
      expect(await screen.findByRole('heading', { name: 'Bob' })).toBeInTheDocument();
      expect(window.location.pathname).toBe(`/conversations/${withBob}`);
    },
  );

  it('still shows the empty state at /', async () => {
    fakeApp();
    render(<App />);

    expect(await screen.findByText('Select a conversation to start chatting.')).toBeInTheDocument();
  });
});
