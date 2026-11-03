import { render, screen, waitFor, within } from '@testing-library/react';
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
const bob = { id: '0198a2b4-7c3e-7a52-9f31-5d2f4c1e8b61', username: 'bobby', nickname: 'Bob' };
const conversationId = '0198a2b4-7c3e-7a52-9f31-5d2f4c1e8b70';

function fakeAccessToken() {
  const encode = (value: object) => btoa(JSON.stringify(value)).replace(/=+$/, '');
  const exp = Math.floor(Date.now() / 1000) + 900;
  return `${encode({ alg: 'EdDSA' })}.${encode({ sub: alice.id, exp })}.signature`;
}

interface SentRequest {
  url: string;
  body: { recipientId?: string; clientMessageId: string; body: string };
  authorization: string | null;
}

/** Signed in as Alice with the server recording sends and echoing them back as sequenced Messages. */
async function openChatWithBob() {
  const token = fakeAccessToken();
  const sent: SentRequest[] = [];
  let sequence = 0;
  const reply = async (request: Request) => {
    const body = (await request.json()) as SentRequest['body'];
    sent.push({
      url: new URL(request.url).pathname,
      body,
      authorization: request.headers.get('authorization'),
    });
    sequence += 1;
    return {
      id: `0198a2b4-7c3e-7a52-9f31-5d2f4c1e8c0${sequence}`,
      conversationId,
      senderId: alice.id,
      sequence,
      clientMessageId: body.clientMessageId,
      body: body.body,
      createdAt: '2026-10-20T09:30:00.000Z',
    };
  };
  server.use(
    http.post('*/api/v1/auth/refresh', () => HttpResponse.json({ accessToken: token })),
    http.get('*/api/v1/users/me', () => HttpResponse.json({ user: alice })),
    http.get('*/api/v1/users/search', () => HttpResponse.json({ users: [bob] })),
    http.get(`*/api/v1/direct-conversations/${bob.id}`, () => HttpResponse.json({ peer: bob })),
    http.post('*/api/v1/direct-messages', async ({ request }) => {
      const message = await reply(request);
      return HttpResponse.json(
        {
          message,
          conversation: { id: conversationId, kind: 'direct', memberIds: [alice.id, bob.id] },
        },
        { status: 201 },
      );
    }),
    http.post(`*/api/v1/conversations/${conversationId}/messages`, async ({ request }) =>
      HttpResponse.json({ message: await reply(request) }, { status: 201 }),
    ),
  );
  render(<App />);
  await screen.findByText(/no conversations yet/i);
  const user = userEvent.setup();
  await user.click(screen.getByRole('button', { name: /new conversation/i }));
  const dialog = await screen.findByRole('dialog', { name: /new conversation/i });
  await user.type(within(dialog).getByRole('combobox'), 'bo');
  await user.click(await within(dialog).findByRole('option', { name: /bobby/i }));
  return { user, sent, token };
}

beforeEach(() => {
  window.history.pushState({}, '', '/');
});

describe('first Direct Message', () => {
  it('opens a new Conversation view after picking a User and shows a sent Message', async () => {
    const { user, sent, token } = await openChatWithBob();

    expect(await screen.findByRole('heading', { name: /bob/i })).toBeInTheDocument();
    await user.type(screen.getByRole('textbox', { name: /message/i }), 'hello bob{Enter}');

    expect(await screen.findByText('hello bob')).toBeInTheDocument();
    expect(sent).toHaveLength(1);
    expect(sent[0]).toMatchObject({
      url: '/api/v1/direct-messages',
      authorization: `Bearer ${token}`,
      body: { recipientId: bob.id, body: 'hello bob' },
    });
    expect(sent[0]?.body.clientMessageId).toMatch(/^[0-9a-f-]{36}$/);
    expect(screen.getByRole('textbox', { name: /message/i })).toHaveValue('');
  });

  it('shows a Message containing HTML literally', async () => {
    const { user } = await openChatWithBob();

    await user.type(screen.getByRole('textbox', { name: /message/i }), '<b>hi</b>{Enter}');

    expect(await screen.findByText('<b>hi</b>')).toBeInTheDocument();
    expect(document.querySelector('b')).toBeNull();
  });

  it('sends later Messages to the Conversation that the first one created', async () => {
    const { user, sent } = await openChatWithBob();
    const box = screen.getByRole('textbox', { name: /message/i });

    await user.type(box, 'one{Enter}');
    await screen.findByText('one');
    await user.type(box, 'two{Enter}');

    expect(await screen.findByText('two')).toBeInTheDocument();
    expect(sent.map((s) => s.url)).toEqual([
      '/api/v1/direct-messages',
      `/api/v1/conversations/${conversationId}/messages`,
    ]);
  });

  it('inserts a newline on Shift+Enter instead of sending', async () => {
    const { user, sent } = await openChatWithBob();
    const box = screen.getByRole('textbox', { name: /message/i });

    await user.type(box, 'line one{Shift>}{Enter}{/Shift}line two');

    expect(box).toHaveValue('line one\nline two');
    expect(sent).toEqual([]);
  });

  it('does not send a blank Message', async () => {
    const { user, sent } = await openChatWithBob();

    await user.type(screen.getByRole('textbox', { name: /message/i }), '   {Enter}');

    expect(sent).toEqual([]);
    expect(screen.getByRole('button', { name: /send/i })).toBeDisabled();
  });

  it('shows a character counter near the limit', async () => {
    const { user } = await openChatWithBob();
    const box = screen.getByRole('textbox', { name: /message/i });

    expect(screen.queryByText(/\/ 4000/)).not.toBeInTheDocument();
    await user.click(box);
    await user.paste('a'.repeat(3900));

    expect(await screen.findByText('3900 / 4000')).toBeInTheDocument();
  });
});

const errorResponse = (code: string, status: number) =>
  HttpResponse.json({ error: { code, message: 'x' } }, { status });

describe('optimistic send and retry', () => {
  it('shows the Message at once as pending, then replaces it with the confirmed one', async () => {
    const { user } = await openChatWithBob();
    let release!: () => void;
    const gate = new Promise<void>((resolve) => (release = resolve));
    server.use(
      http.post('*/api/v1/direct-messages', async ({ request }) => {
        await gate;
        const body = (await request.json()) as SentRequest['body'];
        return HttpResponse.json(
          {
            message: {
              id: '0198a2b4-7c3e-7a52-9f31-5d2f4c1e8c01',
              conversationId,
              senderId: alice.id,
              sequence: 1,
              clientMessageId: body.clientMessageId,
              body: body.body,
              createdAt: '2026-10-20T09:30:00.000Z',
            },
            conversation: { id: conversationId, kind: 'direct', memberIds: [alice.id, bob.id] },
          },
          { status: 201 },
        );
      }),
    );
    const box = screen.getByRole('textbox', { name: /message/i });

    await user.type(box, 'hi there{Enter}');

    const pending = await screen.findByText('hi there');
    expect(box).toHaveValue('');
    expect(pending.closest('[data-variant]')).toHaveAttribute('data-variant', 'muted');
    release();
    await waitFor(() =>
      expect(screen.getByText('hi there').closest('[data-variant]')).toHaveAttribute(
        'data-variant',
        'default',
      ),
    );
    expect(screen.getAllByText('hi there')).toHaveLength(1);
  });

  it('marks a failed Message and retries it with the same client message ID', async () => {
    const { user, sent } = await openChatWithBob();
    server.use(
      http.post('*/api/v1/direct-messages', async ({ request }) => {
        sent.push({
          url: '',
          body: (await request.json()) as SentRequest['body'],
          authorization: null,
        });
        return errorResponse('INTERNAL_ERROR', 500);
      }),
    );

    await user.type(screen.getByRole('textbox', { name: /message/i }), 'flaky{Enter}');

    expect(await screen.findByRole('alert')).toBeInTheDocument();
    expect(screen.getByText('flaky').closest('[data-variant]')).toHaveAttribute(
      'data-variant',
      'destructive',
    );
    server.resetHandlers();
    // Back to the happy handlers from openChatWithBob are gone after reset; install them again.
    server.use(
      http.post('*/api/v1/direct-messages', async ({ request }) => {
        const body = (await request.json()) as SentRequest['body'];
        sent.push({ url: '', body, authorization: null });
        return HttpResponse.json(
          {
            message: {
              id: '0198a2b4-7c3e-7a52-9f31-5d2f4c1e8c01',
              conversationId,
              senderId: alice.id,
              sequence: 1,
              clientMessageId: body.clientMessageId,
              body: body.body,
              createdAt: '2026-10-20T09:30:00.000Z',
            },
            conversation: { id: conversationId, kind: 'direct', memberIds: [alice.id, bob.id] },
          },
          { status: 201 },
        );
      }),
    );
    await user.click(screen.getByRole('button', { name: /retry/i }));

    await waitFor(() => expect(screen.queryByRole('button', { name: /retry/i })).toBeNull());
    expect(screen.getAllByText('flaky')).toHaveLength(1);
    expect(sent).toHaveLength(2);
    expect(sent[1]?.body.clientMessageId).toBe(sent[0]?.body.clientMessageId);
  });

  it('reconciles a 200 for a Message the server had already stored without duplicating it', async () => {
    const { user } = await openChatWithBob();
    let attempts = 0;
    server.use(
      http.post('*/api/v1/direct-messages', async ({ request }) => {
        attempts += 1;
        if (attempts === 1) return HttpResponse.error();
        const body = (await request.json()) as SentRequest['body'];
        return HttpResponse.json(
          {
            message: {
              id: '0198a2b4-7c3e-7a52-9f31-5d2f4c1e8c01',
              conversationId,
              senderId: alice.id,
              sequence: 1,
              clientMessageId: body.clientMessageId,
              body: body.body,
              createdAt: '2026-10-20T09:30:00.000Z',
            },
            conversation: { id: conversationId, kind: 'direct', memberIds: [alice.id, bob.id] },
          },
          { status: 200 },
        );
      }),
    );

    await user.type(screen.getByRole('textbox', { name: /message/i }), 'once{Enter}');
    await user.click(await screen.findByRole('button', { name: /retry/i }));

    await waitFor(() => expect(screen.queryByRole('button', { name: /retry/i })).toBeNull());
    expect(screen.getAllByText('once')).toHaveLength(1);
    expect(screen.queryByRole('alert')).toBeNull();
  });

  it('tells the User when they are rate limited', async () => {
    const { user } = await openChatWithBob();
    server.use(http.post('*/api/v1/direct-messages', () => errorResponse('RATE_LIMITED', 429)));

    await user.type(screen.getByRole('textbox', { name: /message/i }), 'fast{Enter}');

    expect(await screen.findByRole('alert')).toHaveTextContent(/too fast/i);
  });

  it('tells the User when the server rejects the Message as invalid', async () => {
    const { user } = await openChatWithBob();
    server.use(
      http.post('*/api/v1/direct-messages', () => errorResponse('VALIDATION_FAILED', 400)),
    );

    await user.type(screen.getByRole('textbox', { name: /message/i }), 'odd{Enter}');

    expect(await screen.findByRole('alert')).toHaveTextContent(/cannot be sent/i);
  });
});
