import { render, screen, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { http, HttpResponse } from 'msw';
import { beforeEach, describe, expect, it } from 'vitest';
import { App } from './App';
import { server } from './test/server';

const MESSAGE = /something went wrong\. try again\./i;

const alice = {
  id: '0198a2b4-7c3e-7a52-9f31-5d2f4c1e8b60',
  username: 'Alice',
  email: 'alice@example.com',
  nickname: null,
  shareReadReceipts: true,
};
const aliceMember = { id: alice.id, username: alice.username, nickname: alice.nickname };
const bob = { id: '0198a2b4-7c3e-7a52-9f31-5d2f4c1e8b61', username: 'bobby', nickname: 'Bob' };
const dave = { id: '0198a2b4-7c3e-7a52-9f31-5d2f4c1e8b63', username: 'dave', nickname: null };
const groupId = '0198a2b4-7c3e-7a52-9f31-5d2f4c1e8b80';

function fakeAccessToken() {
  const encode = (value: object) => btoa(JSON.stringify(value)).replace(/=+$/, '');
  const exp = Math.floor(Date.now() / 1000) + 900;
  return `${encode({ alg: 'EdDSA' })}.${encode({ sub: alice.id, exp })}.signature`;
}

/** A 2xx whose body does not match any response schema. */
const malformed = (status = 200) => HttpResponse.json({ unexpected: true }, { status });

function group(ownerId: string) {
  return {
    id: groupId,
    kind: 'group' as const,
    name: 'Book Club',
    ownerId,
    members: [aliceMember, bob],
    closed: false,
  };
}

/** Signed in as Alice with one Group in the list. */
function signedIn(ownerId: string) {
  server.use(
    http.post('*/api/v1/auth/refresh', () => HttpResponse.json({ accessToken: fakeAccessToken() })),
    http.get('*/api/v1/users/me', () => HttpResponse.json({ user: alice })),
    http.get('*/api/v1/conversations', () =>
      HttpResponse.json({
        conversations: [{ ...group(ownerId), isMember: true, unreadCount: 0, lastMessage: null }],
      }),
    ),
    http.get(`*/api/v1/conversations/${groupId}`, () =>
      HttpResponse.json({ conversation: { ...group(ownerId), isMember: true } }),
    ),
    http.get(`*/api/v1/conversations/${groupId}/messages`, () =>
      HttpResponse.json({ messages: [], hasMore: false }),
    ),
    http.get('*/api/v1/users/search', () => HttpResponse.json({ users: [dave] })),
  );
}

async function openDetails() {
  render(<App />);
  const user = userEvent.setup();
  await user.click(await screen.findByRole('button', { name: /Book Club/ }));
  await user.click(await screen.findByRole('button', { name: /group details/i }));
  const sheet = await screen.findByRole('dialog', { name: /book club/i });
  return { user, sheet };
}

beforeEach(() => {
  window.history.pushState({}, '', '/');
});

describe('a malformed 2xx response', () => {
  it('New Group: shows the message and the button can be used again', async () => {
    server.use(
      http.post('*/api/v1/auth/refresh', () =>
        HttpResponse.json({ accessToken: fakeAccessToken() }),
      ),
      http.get('*/api/v1/users/me', () => HttpResponse.json({ user: alice })),
      http.get('*/api/v1/conversations', () => HttpResponse.json({ conversations: [] })),
      http.post('*/api/v1/groups', () => malformed(201)),
    );
    render(<App />);
    await screen.findByText(/no conversations yet/i);
    const user = userEvent.setup();
    await user.click(screen.getByRole('button', { name: /new group/i }));
    const dialog = await screen.findByRole('dialog', { name: /new group/i });
    await user.type(within(dialog).getByRole('textbox', { name: /group name/i }), 'Book Club');
    await user.click(within(dialog).getByRole('button', { name: /create group/i }));

    expect(await within(dialog).findByText(MESSAGE)).toBeInTheDocument();
    expect(within(dialog).getByRole('button', { name: /create group/i })).toBeEnabled();
  });

  it('Leave Group: shows the message and the controls can be used again', async () => {
    signedIn(bob.id);
    server.use(http.post(`*/api/v1/groups/${groupId}/leave`, () => malformed()));
    const { user, sheet } = await openDetails();

    await user.click(await within(sheet).findByRole('button', { name: /leave group/i }));
    const confirm = await screen.findByRole('alertdialog');
    await user.click(within(confirm).getByRole('button', { name: /^leave$/i }));

    expect(await screen.findByText(MESSAGE)).toBeInTheDocument();
    expect(within(sheet).getByRole('button', { name: /leave group/i })).toBeEnabled();
  });

  it('Add Member: shows the message and the controls can be used again', async () => {
    signedIn(alice.id);
    server.use(http.post(`*/api/v1/groups/${groupId}/members`, () => malformed(201)));
    const { user, sheet } = await openDetails();

    const search = await within(sheet).findByRole('combobox');
    await user.type(search, 'da');
    await user.click(await within(sheet).findByRole('option', { name: /dave/i }));

    expect(await screen.findByText(MESSAGE)).toBeInTheDocument();
    expect(within(sheet).getByRole('combobox')).toBeEnabled();
  });

  it('Remove Member: shows the message and the controls can be used again', async () => {
    signedIn(alice.id);
    server.use(http.delete(`*/api/v1/groups/${groupId}/members/:userId`, () => malformed()));
    const { user, sheet } = await openDetails();

    await user.click(await within(sheet).findByRole('button', { name: /actions for bob/i }));
    await user.click(await screen.findByRole('menuitem', { name: /remove from group/i }));
    const confirm = await screen.findByRole('alertdialog');
    await user.click(within(confirm).getByRole('button', { name: /^remove$/i }));

    expect(await screen.findByText(MESSAGE)).toBeInTheDocument();
    expect(within(sheet).getByRole('button', { name: /actions for bob/i })).toBeEnabled();
  });

  it('Log in: shows the message and the button can be used again', async () => {
    server.use(http.post('*/api/v1/auth/login', () => malformed()));
    render(<App />);
    const user = userEvent.setup();
    await user.type(await screen.findByLabelText(/username or email/i), 'alice');
    await user.type(screen.getByLabelText(/password/i), 'correct horse battery');
    await user.click(screen.getByRole('button', { name: /^log ?in$/i }));

    expect(await screen.findByRole('alert')).toHaveTextContent(MESSAGE);
    expect(screen.getByRole('button', { name: /^log ?in$/i })).toBeEnabled();
  });

  it('Sign up: shows the message in the form error and the button can be used again', async () => {
    window.history.pushState({}, '', '/signup');
    server.use(http.post('*/api/v1/auth/register', () => malformed(201)));
    render(<App />);
    const user = userEvent.setup();
    await user.type(await screen.findByLabelText(/username/i), 'Alice');
    await user.type(screen.getByLabelText(/email/i), 'alice@example.com');
    await user.type(screen.getByLabelText(/password/i), 'correct horse battery');
    await user.click(screen.getByRole('button', { name: /create account/i }));

    expect(await screen.findByRole('alert')).toHaveTextContent(MESSAGE);
    expect(screen.getByRole('button', { name: /create account/i })).toBeEnabled();
  });

  it('Profile update: shows the message and the button can be used again', async () => {
    signedIn(bob.id);
    server.use(http.patch('*/api/v1/users/me', () => malformed()));
    render(<App />);
    const user = userEvent.setup();
    await screen.findByRole('button', { name: /Book Club/ });
    await user.click(screen.getByRole('button', { name: /alice/i }));
    await user.click(await screen.findByRole('menuitem', { name: /profile/i }));
    const dialog = await screen.findByRole('dialog', { name: /profile/i });
    await user.type(within(dialog).getByLabelText(/nickname/i), 'Ali');
    await user.click(within(dialog).getByRole('button', { name: /save/i }));

    expect(await within(dialog).findByText(MESSAGE)).toBeInTheDocument();
    expect(within(dialog).getByRole('button', { name: /save/i })).toBeEnabled();
  });
});
