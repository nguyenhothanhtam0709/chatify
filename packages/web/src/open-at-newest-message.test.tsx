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
interface Chat {
  id: string;
  peer: Peer;
  label: string;
  total: number;
}

const row = (chat: Chat, sequence: number) => ({
  id: `0198a2b4-7c3e-7a52-9f31-5d2f4c1e${String(sequence).padStart(4, '0')}`,
  conversationId: chat.id,
  senderId: chat.peer.id,
  sequence,
  clientMessageId: `0198a2b4-7c3e-7a52-9f31-5d2f4d1e${String(sequence).padStart(4, '0')}`,
  body: `${chat.label} ${sequence}`,
  createdAt: '2020-03-04T10:00:00.000Z',
});

const summary = (chat: Chat) => ({
  id: chat.id,
  kind: 'direct',
  name: chat.peer.nickname,
  members: [aliceMember, chat.peer],
  isMember: true,
  closed: false,
  unreadCount: 0,
  lastMessage:
    chat.total === 0
      ? null
      : {
          sequence: chat.total,
          senderId: chat.peer.id,
          preview: `${chat.label} ${chat.total}`,
          createdAt: '2020-03-04T10:00:00Z',
        },
});

/**
 * Serves each Conversation's Messages newest first like the real endpoint. The first page of
 * the Conversation with id `gate` is held back until the returned `release` is called.
 */
function fakeConversations(chats: Chat[], gate?: string) {
  let release: () => void = () => {};
  const held = new Promise<void>((resolve) => (release = resolve));
  server.use(
    http.post('*/api/v1/auth/refresh', () => HttpResponse.json({ accessToken: fakeAccessToken() })),
    http.get('*/api/v1/users/me', () => HttpResponse.json({ user: alice })),
    http.get('*/api/v1/users/search', () => HttpResponse.json({ users: [carol] })),
    http.get('*/api/v1/conversations', () =>
      HttpResponse.json({ conversations: chats.map(summary) }),
    ),
    ...chats.map((chat) =>
      http.get(`*/api/v1/conversations/${chat.id}/messages`, async ({ request }) => {
        const params = new URL(request.url).searchParams;
        if (chat.id === gate && !params.has('before')) await held;
        const limit = Number(params.get('limit') ?? 10);
        const before = Number(params.get('before') ?? chat.total + 1);
        const older = Array.from({ length: before - 1 }, (_, i) => before - 1 - i);
        return HttpResponse.json({
          messages: older.slice(0, limit).map((n) => row(chat, n)),
          hasMore: older.length > limit,
        });
      }),
    ),
  );
  return release;
}

const bobChat: Chat = { id: withBob, peer: bob, label: 'message', total: TOTAL };

beforeEach(() => {
  window.history.pushState({}, '', '/');
  stubLayout();
});

afterEach(() => {
  unstubLayout();
});

describe('Opening a Conversation', () => {
  it('lands at the newest Message when opened from the Conversation list', async () => {
    fakeConversations([bobChat]);
    const user = userEvent.setup();
    render(<App />);

    await user.click(await screen.findByRole('button', { name: /Bob.*message 25/i }));
    const viewport = await screen.findByRole('region', { name: /messages/i });
    await screen.findAllByText('message 25');

    await waitFor(() => expect(viewport.scrollTop).toBe(FIRST_PAGE_END));
    // jsdom does not fire the scroll event a browser fires after the scroll.
    fireEvent.scroll(viewport);
    await waitFor(() =>
      expect(screen.getByRole('button', { name: /jump to latest/i })).toHaveAttribute(
        'data-active',
        'false',
      ),
    );
  });

  it('lands at the newest Message of the Conversation switched to', async () => {
    fakeConversations([
      { ...bobChat, label: 'bob says' },
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
});

describe('The empty state', () => {
  it('does not show "No messages yet" while the first page is loading', async () => {
    const release = fakeConversations([bobChat], withBob);
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
    const release = fakeConversations([{ ...bobChat, total: 0 }], withBob);
    const user = userEvent.setup();
    render(<App />);

    await user.click(await screen.findByRole('button', { name: /Bob/i }));
    await screen.findByRole('heading', { name: 'Bob' });
    expect(screen.queryByText(/Say hello to Bob/)).not.toBeInTheDocument();

    release();
    expect(await screen.findByText(/Say hello to Bob/)).toBeInTheDocument();
  });

  it('shows "No messages yet" straight away for a new Direct Conversation', async () => {
    fakeConversations([bobChat]);
    const user = userEvent.setup();
    render(<App />);

    await user.click(await screen.findByRole('button', { name: /new conversation/i }));
    const dialog = await screen.findByRole('dialog', { name: /new conversation/i });
    await user.type(within(dialog).getByRole('combobox'), 'ca');
    await user.click(await within(dialog).findByRole('option', { name: /carol/i }));

    expect(await screen.findByText(/Say hello to Carol/)).toBeInTheDocument();
  });
});
