import { render, screen, waitFor, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { http, HttpResponse } from 'msw';
import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import { App } from './App';
import { server } from './test/server';
import { stubLayout, unstubLayout } from './test/layout';

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

function fakeAccessToken() {
  const encode = (value: object) => btoa(JSON.stringify(value)).replace(/=+$/, '');
  const exp = Math.floor(Date.now() / 1000) + 900;
  return `${encode({ alg: 'EdDSA' })}.${encode({ sub: alice.id, exp })}.signature`;
}

const direct = (id: string, peer: typeof bob) => ({
  id,
  kind: 'direct' as const,
  members: [aliceMember, peer],
});

const summary = (id: string, peer: typeof bob) => ({
  ...direct(id, peer),
  name: peer.nickname,
  isMember: true,
  closed: false,
  unreadCount: 0,
  lastMessage: null,
});

function fakeApp() {
  server.use(
    http.post('*/api/v1/auth/refresh', () => HttpResponse.json({ accessToken: fakeAccessToken() })),
    http.get('*/api/v1/users/me', () => HttpResponse.json({ user: alice })),
    http.get('*/api/v1/users/search', () => HttpResponse.json({ users: [carol] })),
    http.get('*/api/v1/conversations', () =>
      HttpResponse.json({ conversations: [summary(withBob, bob), summary(withCarol, carol)] }),
    ),
    http.get(`*/api/v1/conversations/${withBob}`, () =>
      HttpResponse.json({ conversation: direct(withBob, bob) }),
    ),
    http.get(`*/api/v1/conversations/${withCarol}`, () =>
      HttpResponse.json({ conversation: direct(withCarol, carol) }),
    ),
    http.get('*/api/v1/conversations/:id/messages', () =>
      HttpResponse.json({ messages: [], hasMore: false }),
    ),
  );
}

async function pickInSheet(user: ReturnType<typeof userEvent.setup>, name: RegExp) {
  await user.click(await screen.findByRole('button', { name: /toggle sidebar/i }));
  const sheet = await screen.findByRole('dialog');
  await user.click(await within(sheet).findByRole('button', { name }));
}

beforeEach(() => {
  window.history.pushState({}, '', '/');
  window.innerWidth = 500;
  stubLayout();
});

afterEach(() => {
  window.innerWidth = 1024;
  unstubLayout();
});

describe('Mobile sidebar sheet', () => {
  it('closes when a Conversation is picked in it', async () => {
    fakeApp();
    const user = userEvent.setup();
    render(<App />);

    await pickInSheet(user, /Bob/);

    await waitFor(() => expect(screen.queryByRole('dialog')).not.toBeInTheDocument());
    await screen.findByRole('heading', { name: 'Bob' });
  });

  it('opens a Conversation URL with the sheet closed', async () => {
    fakeApp();
    window.history.pushState({}, '', `/conversations/${withBob}`);
    render(<App />);

    await screen.findByRole('heading', { name: 'Bob' });
    expect(screen.queryByRole('dialog')).not.toBeInTheDocument();
  });

  it('does not reopen the sheet on Back', async () => {
    fakeApp();
    const user = userEvent.setup();
    render(<App />);
    await pickInSheet(user, /Bob/);
    await waitFor(() => expect(screen.queryByRole('dialog')).not.toBeInTheDocument());
    await screen.findByRole('heading', { name: 'Bob' });

    window.history.back();

    expect(await screen.findByText('Select a conversation to start chatting.')).toBeInTheDocument();
    expect(screen.queryByRole('dialog')).not.toBeInTheDocument();
  });

  it('closes when Back changes the open Conversation while the sheet is open', async () => {
    fakeApp();
    const user = userEvent.setup();
    window.history.pushState({}, '', `/conversations/${withBob}`);
    render(<App />);
    await screen.findByRole('heading', { name: 'Bob' });
    await pickInSheet(user, /Carol/);
    await waitFor(() => expect(screen.queryByRole('dialog')).not.toBeInTheDocument());
    await screen.findByRole('heading', { name: 'Carol' });
    await user.click(screen.getByRole('button', { name: /toggle sidebar/i }));
    await screen.findByRole('dialog');

    window.history.back();

    await waitFor(() => expect(screen.queryByRole('dialog')).not.toBeInTheDocument());
    await screen.findByRole('heading', { name: 'Bob' });
  });
});
