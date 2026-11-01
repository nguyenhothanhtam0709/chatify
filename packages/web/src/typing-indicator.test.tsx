import { act, fireEvent, render, screen } from '@testing-library/react';
import { http, HttpResponse } from 'msw';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
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
interface Member {
  id: string;
  username: string;
  nickname: string | null;
}
const bobWithNickname: Member = {
  id: '0198a2b4-7c3e-7a52-9f31-5d2f4c1e8b61',
  username: 'bobby',
  nickname: 'Bob',
};
const bobPlain: Member = { ...bobWithNickname, nickname: null };
const withBob = '0198a2b4-7c3e-7a52-9f31-5d2f4c1e8b70';

function fakeAccessToken() {
  const encode = (value: object) => btoa(JSON.stringify(value)).replace(/=+$/, '');
  const exp = Math.floor(Date.now() / 1000) + 900;
  return `${encode({ alg: 'EdDSA' })}.${encode({ sub: alice.id, exp })}.signature`;
}

const summary = (bob: Member) => ({
  id: withBob,
  kind: 'direct' as const,
  name: bob.nickname ?? bob.username,
  members: [aliceMember, bob],
  isMember: true,
  closed: false,
  unreadCount: 0,
  lastMessage: {
    sequence: 1,
    senderId: bob.id,
    preview: 'hello',
    createdAt: '2020-03-04T10:00:00Z',
  },
});

const carol = { id: '0198a2b4-7c3e-7a52-9f31-5d2f4c1e8b62', username: 'carol', nickname: null };
const withCarol = {
  id: '0198a2b4-7c3e-7a52-9f31-5d2f4c1e8b71',
  kind: 'direct' as const,
  name: 'carol',
  members: [aliceMember, carol],
  isMember: true,
  closed: false,
  unreadCount: 0,
  lastMessage: {
    sequence: 1,
    senderId: carol.id,
    preview: 'yo',
    createdAt: '2020-03-03T10:00:00Z',
  },
};

const bobMessage = {
  id: '0198a2b4-7c3e-7a52-9f31-5d2f4c1e0002',
  conversationId: withBob,
  senderId: bobWithNickname.id,
  sequence: 2,
  clientMessageId: '0198a2b4-7c3e-7a52-9f31-5d2f4d1e0002',
  kind: 'text' as const,
  body: 'a new message',
  createdAt: '2020-03-05T10:00:00.000Z',
};

/** Signed in as Alice with one Direct Conversation with Bob; every typing request is recorded. */
function signedIn(
  bob: Member,
  answer: () => Response = () => new HttpResponse(null, { status: 204 }),
) {
  const token = fakeAccessToken();
  const sent: string[] = [];
  server.use(
    http.post('*/api/v1/auth/refresh', () => HttpResponse.json({ accessToken: token })),
    http.get('*/api/v1/users/me', () => HttpResponse.json({ user: alice })),
    http.get('*/api/v1/conversations', () =>
      HttpResponse.json({ conversations: [summary(bob), withCarol] }),
    ),
    http.get(`*/api/v1/conversations/${withCarol.id}/messages`, () =>
      HttpResponse.json({ messages: [], hasMore: false }),
    ),
    http.get(`*/api/v1/conversations/${withBob}/messages`, () =>
      HttpResponse.json({ messages: [], hasMore: false }),
    ),
    http.post(`*/api/v1/conversations/${withBob}/typing`, async ({ request }) => {
      sent.push(((await request.json()) as { state: string }).state);
      return answer();
    }),
  );
  return sent;
}

const typingEvent = (state: 'typing' | 'stopped', user = bobWithNickname) =>
  ({ type: 'typing.updated', conversationId: withBob, state, user }) as const;

/** Lets pending promises (fetches answered by MSW) settle without moving the fake clock. */
const flush = () => act(() => vi.advanceTimersByTimeAsync(0));
const advance = (ms: number) => act(() => vi.advanceTimersByTimeAsync(ms));

async function openBob(bob = bobWithNickname) {
  const fake = fakeRealtime();
  render(<App createRealtime={() => fake.realtime} />);
  fireEvent.click(
    await screen.findByRole('button', { name: new RegExp(bob.nickname ?? bob.username) }),
  );
  await screen.findByRole('textbox', { name: 'Message' });
  return fake;
}

beforeEach(() => {
  window.history.pushState({}, '', '/');
});

afterEach(() => {
  vi.useRealTimers();
});

describe('Typing Indicator, receiving', () => {
  it('shows "<Nickname> is typing…" and clears on stopped', async () => {
    signedIn(bobWithNickname);
    const fake = await openBob();
    vi.useFakeTimers({ shouldAdvanceTime: false });

    act(() => fake.emit(typingEvent('typing')));
    expect(screen.getByText('Bob is typing…')).toBeInTheDocument();

    act(() => fake.emit(typingEvent('stopped')));
    expect(screen.queryByText(/is typing/)).not.toBeInTheDocument();
  });

  it('falls back to the Username when there is no Nickname', async () => {
    signedIn(bobPlain);
    const fake = await openBob(bobPlain);
    vi.useFakeTimers();

    act(() => fake.emit(typingEvent('typing', bobPlain)));

    expect(screen.getByText('bobby is typing…')).toBeInTheDocument();
  });

  it('expires 6 seconds after the last signal, and a refresh keeps it shown', async () => {
    signedIn(bobWithNickname);
    const fake = await openBob();
    vi.useFakeTimers();

    act(() => fake.emit(typingEvent('typing')));
    await advance(4000);
    act(() => fake.emit(typingEvent('typing')));
    await advance(4000);
    expect(screen.getByText('Bob is typing…')).toBeInTheDocument();

    await advance(2100);
    expect(screen.queryByText(/is typing/)).not.toBeInTheDocument();
  });

  it("clears on a message.created from the typist, but not on someone else's", async () => {
    signedIn(bobWithNickname);
    const fake = await openBob();
    vi.useFakeTimers();

    act(() => fake.emit(typingEvent('typing')));
    act(() =>
      fake.emit({
        type: 'message.created',
        message: { ...bobMessage, senderId: alice.id },
      }),
    );
    expect(screen.getByText('Bob is typing…')).toBeInTheDocument();

    act(() => fake.emit({ type: 'message.created', message: bobMessage }));
    expect(screen.queryByText(/is typing/)).not.toBeInTheDocument();
  });

  it('clears when the connection is lost', async () => {
    signedIn(bobWithNickname);
    const fake = await openBob();
    vi.useFakeTimers();

    act(() => fake.emit(typingEvent('typing')));
    act(() => fake.disconnect());

    expect(screen.queryByText(/is typing/)).not.toBeInTheDocument();
  });

  it('shows nothing for a signal from the User themself or for another Conversation', async () => {
    signedIn(bobWithNickname);
    const fake = await openBob();
    vi.useFakeTimers();

    act(() => fake.emit(typingEvent('typing', aliceMember)));
    act(() =>
      fake.emit({
        ...typingEvent('typing'),
        conversationId: '0198a2b4-7c3e-7a52-9f31-5d2f4c1e8b99',
      }),
    );

    expect(screen.queryByText(/is typing/)).not.toBeInTheDocument();
  });

  it('clears when another Conversation is opened, and does not return on coming back', async () => {
    signedIn(bobWithNickname);
    const fake = await openBob();
    vi.useFakeTimers();
    act(() => fake.emit(typingEvent('typing')));
    expect(screen.getByText('Bob is typing…')).toBeInTheDocument();

    vi.useRealTimers();
    fireEvent.click(screen.getByRole('button', { name: /carol/ }));
    await screen.findByRole('heading', { name: 'carol' });
    expect(screen.queryByText(/is typing/)).not.toBeInTheDocument();

    fireEvent.click(screen.getByRole('button', { name: /Bob/ }));
    await screen.findByRole('heading', { name: 'Bob' });
    expect(screen.queryByText(/is typing/)).not.toBeInTheDocument();
  });
});

describe('Typing Indicator, sending', () => {
  it('sends typing on input, at most once every 3 seconds, and nothing for untouched text', async () => {
    const sent = signedIn(bobWithNickname);
    await openBob();
    vi.useFakeTimers();
    const box = screen.getByRole('textbox', { name: 'Message' });

    fireEvent.change(box, { target: { value: 'h' } });
    await flush();
    expect(sent).toEqual(['typing']);

    await advance(1000);
    fireEvent.change(box, { target: { value: 'he' } });
    await flush();
    expect(sent).toEqual(['typing']);

    await advance(2100);
    fireEvent.change(box, { target: { value: 'hel' } });
    await flush();
    expect(sent).toEqual(['typing', 'typing']);

    await advance(10_000);
    await flush();
    expect(sent).toEqual(['typing', 'typing']);
  });

  it('sends stopped when the composer is cleared', async () => {
    const sent = signedIn(bobWithNickname);
    await openBob();
    vi.useFakeTimers();
    const box = screen.getByRole('textbox', { name: 'Message' });

    fireEvent.change(box, { target: { value: 'h' } });
    await flush();
    fireEvent.change(box, { target: { value: '' } });
    await flush();

    expect(sent).toEqual(['typing', 'stopped']);
  });

  it('sends stopped when the composer loses focus without a send, and only after a typing', async () => {
    const sent = signedIn(bobWithNickname);
    await openBob();
    vi.useFakeTimers();
    const box = screen.getByRole('textbox', { name: 'Message' });

    fireEvent.blur(box);
    await flush();
    expect(sent).toEqual([]);

    fireEvent.change(box, { target: { value: 'h' } });
    await flush();
    fireEvent.blur(box);
    await flush();
    fireEvent.blur(box);
    await flush();

    expect(sent).toEqual(['typing', 'stopped']);
  });

  it('shows no error when the request fails or is rate limited', async () => {
    const sent = signedIn(bobWithNickname, () =>
      HttpResponse.json({ error: { code: 'RATE_LIMITED', message: 'slow down' } }, { status: 429 }),
    );
    await openBob();
    vi.useFakeTimers();

    fireEvent.change(screen.getByRole('textbox', { name: 'Message' }), { target: { value: 'h' } });
    await flush();

    expect(sent).toEqual(['typing']);
    expect(screen.queryByRole('alert')).not.toBeInTheDocument();
  });
});
