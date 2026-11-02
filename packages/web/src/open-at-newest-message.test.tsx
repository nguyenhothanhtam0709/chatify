import { fireEvent, render, screen, waitFor, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { http, HttpResponse } from 'msw';
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

const TOTAL = 25;
/** The first page holds 10 Messages; scrolled to the end, the viewport sits here. */
const FIRST_PAGE_END = 10 * ITEM_HEIGHT - VIEWPORT_HEIGHT;

function fakeAccessToken() {
  const encode = (value: object) => btoa(JSON.stringify(value)).replace(/=+$/, '');
  const exp = Math.floor(Date.now() / 1000) + 900;
  return `${encode({ alg: 'EdDSA' })}.${encode({ sub: alice.id, exp })}.signature`;
}

type Peer = typeof bob;
interface FakeConversation {
  id: string;
  peer: Peer;
  label: string;
  total: number;
  /** Messages per page; the default of 10 fills the view. */
  pageSize?: number;
}

const row = (conversation: FakeConversation, sequence: number) => ({
  id: `0198a2b4-7c3e-7a52-9f31-5d2f4c1e${String(sequence).padStart(4, '0')}`,
  conversationId: conversation.id,
  senderId: conversation.peer.id,
  sequence,
  clientMessageId: `0198a2b4-7c3e-7a52-9f31-5d2f4d1e${String(sequence).padStart(4, '0')}`,
  body: `${conversation.label} ${sequence}`,
  createdAt: '2020-03-04T10:00:00.000Z',
});

const summary = (conversation: FakeConversation) => ({
  id: conversation.id,
  kind: 'direct',
  name: conversation.peer.nickname,
  members: [aliceMember, conversation.peer],
  isMember: true,
  closed: false,
  unreadCount: 0,
  lastMessage:
    conversation.total === 0
      ? null
      : {
          sequence: conversation.total,
          senderId: conversation.peer.id,
          preview: `${conversation.label} ${conversation.total}`,
          createdAt: '2020-03-04T10:00:00Z',
        },
});

/**
 * Serves each Conversation's Messages newest first like the real endpoint. The first page of
 * the Conversation with id `gate` is held back until the returned `release` is called.
 */
function fakeConversations(conversations: FakeConversation[], gate?: string) {
  let release: () => void = () => {};
  const held = new Promise<void>((resolve) => (release = resolve));
  server.use(
    http.post('*/api/v1/auth/refresh', () => HttpResponse.json({ accessToken: fakeAccessToken() })),
    http.get('*/api/v1/users/me', () => HttpResponse.json({ user: alice })),
    http.get('*/api/v1/users/search', () => HttpResponse.json({ users: [carol] })),
    http.get('*/api/v1/conversations', () =>
      HttpResponse.json({ conversations: conversations.map(summary) }),
    ),
    ...conversations.map((conversation) =>
      http.get(`*/api/v1/conversations/${conversation.id}/messages`, async ({ request }) => {
        const params = new URL(request.url).searchParams;
        if (conversation.id === gate && !params.has('before')) await held;
        const limit = Number(params.get('limit') ?? conversation.pageSize ?? 10);
        const before = Number(params.get('before') ?? conversation.total + 1);
        const older = Array.from({ length: before - 1 }, (_, i) => before - 1 - i);
        return HttpResponse.json({
          messages: older.slice(0, limit).map((n) => row(conversation, n)),
          hasMore: older.length > limit,
        });
      }),
    ),
  );
  return release;
}

/** jsdom does not fire the scroll event a browser fires after the scroll, so fire it. */
async function expectAtLiveEdge(viewport: HTMLElement) {
  fireEvent.scroll(viewport);
  await waitFor(() =>
    expect(screen.getByRole('button', { name: /jump to latest/i })).toHaveAttribute(
      'data-active',
      'false',
    ),
  );
}

const bobConversation: FakeConversation = {
  id: withBob,
  peer: bob,
  label: 'message',
  total: TOTAL,
};

beforeEach(() => {
  window.history.pushState({}, '', '/');
  stubLayout();
});

afterEach(() => {
  unstubLayout();
});

describe('Opening a Conversation', () => {
  it('lands at the newest Message when opened from the Conversation list', async () => {
    fakeConversations([bobConversation]);
    const user = userEvent.setup();
    render(<App />);

    await user.click(await screen.findByRole('button', { name: /Bob.*message 25/i }));
    const viewport = await screen.findByRole('region', { name: /messages/i });
    await screen.findAllByText('message 25');

    await waitFor(() => expect(viewport.scrollTop).toBe(FIRST_PAGE_END));
    await expectAtLiveEdge(viewport);
  });

  it('lands at the newest Message of the Conversation switched to', async () => {
    fakeConversations([
      { ...bobConversation, label: 'bob says' },
      { id: withCarol, peer: carol, label: 'carol says', total: TOTAL },
    ]);
    const user = userEvent.setup();
    render(<App />);

    await user.click(await screen.findByRole('button', { name: /Bob.*bob says 25/i }));
    await screen.findAllByText('bob says 25');
    await user.click(await screen.findByRole('button', { name: /Carol.*carol says 25/i }));
    await screen.findAllByText('carol says 25');

    const viewport = await screen.findByRole('region', { name: /messages/i });
    await waitFor(() => expect(viewport.scrollTop).toBe(FIRST_PAGE_END));
  });

  it('stays at the newest Message while older pages load to fill a short first page', async () => {
    // One Message per page and 3 in view: three older pages load by themselves.
    fakeConversations([{ ...bobConversation, pageSize: 1 }]);
    const user = userEvent.setup();
    render(<App />);

    await user.click(await screen.findByRole('button', { name: /Bob.*message 25/i }));
    const viewport = await screen.findByRole('region', { name: /messages/i });
    await screen.findByText('message 22');

    // 4 Messages loaded, 3 in view: the newest is at the bottom.
    await waitFor(() => expect(viewport.scrollTop).toBe(4 * ITEM_HEIGHT - VIEWPORT_HEIGHT));
    expect(screen.queryByText('message 21')).not.toBeInTheDocument();
    await expectAtLiveEdge(viewport);
  });
});

describe('The empty state', () => {
  it('does not show "No messages yet" while the first page is loading', async () => {
    const release = fakeConversations([bobConversation], withBob);
    const user = userEvent.setup();
    render(<App />);

    await user.click(await screen.findByRole('button', { name: /Bob.*message 25/i }));
    await screen.findByRole('heading', { name: 'Bob' });
    expect(screen.queryByText(/Say hello to Bob/)).not.toBeInTheDocument();

    release();
    await screen.findAllByText('message 25');
    expect(screen.queryByText(/Say hello to Bob/)).not.toBeInTheDocument();
  });

  it('shows "No messages yet" once the first page answers with no Messages', async () => {
    const release = fakeConversations([{ ...bobConversation, total: 0 }], withBob);
    const user = userEvent.setup();
    render(<App />);

    await user.click(await screen.findByRole('button', { name: /Bob/i }));
    await screen.findByRole('heading', { name: 'Bob' });
    expect(screen.queryByText(/Say hello to Bob/)).not.toBeInTheDocument();

    release();
    expect(await screen.findByText(/Say hello to Bob/)).toBeInTheDocument();
  });

  it('shows "No messages yet" when the first page fails to load', async () => {
    fakeConversations([bobConversation]);
    server.use(
      http.get(`*/api/v1/conversations/${withBob}/messages`, () =>
        HttpResponse.json({ error: { code: 'internal' } }, { status: 500 }),
      ),
    );
    const user = userEvent.setup();
    render(<App />);

    await user.click(await screen.findByRole('button', { name: /Bob.*message 25/i }));

    expect(await screen.findByText(/Say hello to Bob/)).toBeInTheDocument();
  });

  it('shows "No messages yet" straight away for a new Direct Conversation', async () => {
    fakeConversations([bobConversation]);
    const user = userEvent.setup();
    render(<App />);

    await user.click(await screen.findByRole('button', { name: /new conversation/i }));
    const dialog = await screen.findByRole('dialog', { name: /new conversation/i });
    await user.type(within(dialog).getByRole('combobox'), 'ca');
    await user.click(await within(dialog).findByRole('option', { name: /carol/i }));

    expect(await screen.findByText(/Say hello to Carol/)).toBeInTheDocument();
  });
});
