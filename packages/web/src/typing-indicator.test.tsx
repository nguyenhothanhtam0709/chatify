import { act, fireEvent, render, screen, waitFor, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
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
    http.post(`*/api/v1/conversations/${withBob}/messages`, async ({ request }) => {
      const body = (await request.json()) as { clientMessageId: string; body: string };
      return HttpResponse.json(
        {
          message: {
            ...bobMessage,
            senderId: alice.id,
            sequence: 3,
            clientMessageId: body.clientMessageId,
            body: body.body,
          },
        },
        { status: 201 },
      );
    }),
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

  it('sends no stopped when a send follows, however the focus leaves the composer', async () => {
    const sent = signedIn(bobWithNickname);
    await openBob();
    vi.useFakeTimers();
    const box = screen.getByRole('textbox', { name: 'Message' });
    const send = screen.getByRole('button', { name: 'Send' });

    // Enter: the text is sent, then the composer loses focus.
    fireEvent.change(box, { target: { value: 'h' } });
    await flush();
    fireEvent.keyDown(box, { key: 'Enter' });
    await flush();
    fireEvent.blur(box);
    await flush();
    expect(sent).toEqual(['typing']);

    // Mouse or touch: the press must not blur the composer, and a blur towards Send is a send.
    fireEvent.change(box, { target: { value: 'again' } });
    await flush();
    expect(fireEvent.mouseDown(send)).toBe(false);
    fireEvent.blur(box, { relatedTarget: send });
    fireEvent.click(send);
    await flush();
    fireEvent.blur(box);
    await flush();

    expect(sent).toEqual(['typing', 'typing']);
  });

  it('shows no error when the request is answered with a network failure', async () => {
    const sent = signedIn(bobWithNickname, () => HttpResponse.error());
    await openBob();
    vi.useFakeTimers();

    fireEvent.change(screen.getByRole('textbox', { name: 'Message' }), { target: { value: 'h' } });
    await flush();

    expect(sent).toEqual(['typing']);
    expect(screen.queryByRole('alert')).not.toBeInTheDocument();
  });

  it('keeps a long typist line to one truncated line', async () => {
    const long = { ...bobWithNickname, nickname: 'B'.repeat(50) };
    signedIn(long);
    const fake = await openBob(long);
    vi.useFakeTimers();

    act(() => fake.emit(typingEvent('typing', long)));

    expect(screen.getByRole('status')).toHaveClass('truncate');
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

describe('Typing Indicator in a Group', () => {
  const groupId = '0198a2b4-7c3e-7a52-9f31-5d2f4c1e8b80';
  const dana = { id: '0198a2b4-7c3e-7a52-9f31-5d2f4c1e8b63', username: 'dana', nickname: 'Dana' };
  const members = [aliceMember, bobWithNickname, carol, dana];

  async function openGroup() {
    const group = {
      id: groupId,
      kind: 'group' as const,
      name: 'Book Club',
      ownerId: alice.id,
      members,
      closed: false,
    };
    server.use(
      http.post('*/api/v1/auth/refresh', () =>
        HttpResponse.json({ accessToken: fakeAccessToken() }),
      ),
      http.get('*/api/v1/users/me', () => HttpResponse.json({ user: alice })),
      http.get('*/api/v1/conversations', () =>
        HttpResponse.json({
          conversations: [{ ...group, isMember: true, unreadCount: 0, lastMessage: null }],
        }),
      ),
      http.get(`*/api/v1/conversations/${groupId}`, () =>
        HttpResponse.json({ conversation: { ...group, isMember: true } }),
      ),
      http.get(`*/api/v1/conversations/${groupId}/messages`, () =>
        HttpResponse.json({ messages: [], hasMore: false }),
      ),
    );
    const fake = fakeRealtime();
    render(<App createRealtime={() => fake.realtime} />);
    fireEvent.click(await screen.findByRole('button', { name: /Book Club/ }));
    await screen.findByRole('textbox', { name: 'Message' });
    return fake;
  }

  const groupTyping = (state: 'typing' | 'stopped', user: Member) =>
    ({ type: 'typing.updated', conversationId: groupId, state, user }) as const;

  it('shows one, two and three-or-more typists, and shrinks as they stop', async () => {
    const fake = await openGroup();
    vi.useFakeTimers();

    act(() => fake.emit(groupTyping('typing', bobWithNickname)));
    expect(screen.getByText('Bob is typing…')).toBeInTheDocument();

    act(() => fake.emit(groupTyping('typing', carol)));
    expect(screen.getByText('Bob and carol are typing…')).toBeInTheDocument();

    act(() => fake.emit(groupTyping('typing', dana)));
    expect(screen.getByText('Several people are typing…')).toBeInTheDocument();

    act(() => fake.emit(groupTyping('stopped', bobWithNickname)));
    expect(screen.getByText('carol and Dana are typing…')).toBeInTheDocument();
  });

  it('expires and clears each typist on their own', async () => {
    const fake = await openGroup();
    vi.useFakeTimers();

    act(() => fake.emit(groupTyping('typing', bobWithNickname)));
    await advance(4000);
    act(() => fake.emit(groupTyping('typing', carol)));
    expect(screen.getByText('Bob and carol are typing…')).toBeInTheDocument();

    await advance(2100);
    expect(screen.getByText('carol is typing…')).toBeInTheDocument();

    act(() =>
      fake.emit({
        type: 'message.created',
        message: { ...bobMessage, conversationId: groupId, senderId: carol.id },
      }),
    );
    expect(screen.queryByText(/typing/)).not.toBeInTheDocument();
  });

  it("one typist's Message clears only that typist", async () => {
    const fake = await openGroup();
    vi.useFakeTimers();

    act(() => fake.emit(groupTyping('typing', bobWithNickname)));
    act(() => fake.emit(groupTyping('typing', carol)));
    act(() =>
      fake.emit({
        type: 'message.created',
        message: { ...bobMessage, conversationId: groupId },
      }),
    );

    expect(screen.getByText('carol is typing…')).toBeInTheDocument();
  });
});

describe('Typing Indicator in a Direct view picked through the dialog', () => {
  async function pickBob({ existing }: { existing: boolean }) {
    const typed: string[] = [];
    server.use(
      http.post('*/api/v1/auth/refresh', () =>
        HttpResponse.json({ accessToken: fakeAccessToken() }),
      ),
      http.get('*/api/v1/users/me', () => HttpResponse.json({ user: alice })),
      http.get('*/api/v1/conversations', () =>
        HttpResponse.json({ conversations: existing ? [summary(bobWithNickname)] : [] }),
      ),
      http.get('*/api/v1/users/search', () => HttpResponse.json({ users: [bobWithNickname] })),
      http.get(`*/api/v1/direct-conversations/${bobWithNickname.id}`, () =>
        HttpResponse.json({
          peer: bobWithNickname,
          ...(existing ? { conversationId: withBob } : {}),
        }),
      ),
      http.get(`*/api/v1/conversations/${withBob}`, () =>
        HttpResponse.json({
          conversation: {
            id: withBob,
            kind: 'direct',
            members: [aliceMember, bobWithNickname],
          },
        }),
      ),
      http.get(`*/api/v1/conversations/${withBob}/messages`, () =>
        HttpResponse.json({ messages: [], hasMore: false }),
      ),
      http.post('*/api/v1/conversations/:id/typing', async ({ request }) => {
        typed.push(((await request.json()) as { state: string }).state);
        return new HttpResponse(null, { status: 204 });
      }),
    );
    render(<App />);
    await screen.findByText(existing ? /bob/i : /no conversations yet/i);
    const user = userEvent.setup();
    await user.click(screen.getByRole('button', { name: /new conversation/i }));
    const dialog = await screen.findByRole('dialog', { name: /new conversation/i });
    await user.type(within(dialog).getByRole('combobox'), 'bo');
    await user.click(await within(dialog).findByRole('option', { name: /bob/i }));
    const box = await screen.findByRole('textbox', { name: 'Message' });
    return { user, box, typed };
  }

  it('sends the signal for an existing Direct Conversation', async () => {
    const { user, box, typed } = await pickBob({ existing: true });

    await user.type(box, 'hello');
    await user.clear(box);
    await user.tab();

    expect(window.location.pathname).toBe(`/conversations/${withBob}`);
    await waitFor(() => expect(typed).toEqual(['typing', 'stopped']));
  });

  it('sends no signal for a brand-new Direct Conversation, before its first Message', async () => {
    const { user, box, typed } = await pickBob({ existing: false });

    await user.type(box, 'hello');
    await user.clear(box);
    await user.tab();

    expect(window.location.pathname).toBe(`/direct/${bobWithNickname.id}`);
    expect(typed).toEqual([]);
  });
});
