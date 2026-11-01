import { act, render, screen, within } from '@testing-library/react';
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
const carol = { id: '0198a2b4-7c3e-7a52-9f31-5d2f4c1e8b62', username: 'carol', nickname: null };
const dave = { id: '0198a2b4-7c3e-7a52-9f31-5d2f4c1e8b63', username: 'dave', nickname: null };
const groupId = '0198a2b4-7c3e-7a52-9f31-5d2f4c1e8b80';

function fakeAccessToken() {
  const encode = (value: object) => btoa(JSON.stringify(value)).replace(/=+$/, '');
  const exp = Math.floor(Date.now() / 1000) + 900;
  return `${encode({ alg: 'EdDSA' })}.${encode({ sub: alice.id, exp })}.signature`;
}

const groupOwnedBy = (ownerId: string, members: unknown[]) => ({
  id: groupId,
  kind: 'group' as const,
  name: 'Book Club',
  ownerId,
  members,
  closed: members.length === 0,
});

/** Signed in as Alice, with a Group in the list; the server records membership changes. */
function signedIn(initial: ReturnType<typeof groupOwnedBy>) {
  let current = initial;
  const added: unknown[] = [];
  const removed: string[] = [];
  server.use(
    http.post('*/api/v1/auth/refresh', () => HttpResponse.json({ accessToken: fakeAccessToken() })),
    http.get('*/api/v1/users/me', () => HttpResponse.json({ user: alice })),
    http.get('*/api/v1/conversations', () =>
      HttpResponse.json({
        conversations: [{ ...current, isMember: true, unreadCount: 0, lastMessage: null }],
      }),
    ),
    http.get(`*/api/v1/conversations/${groupId}`, () =>
      HttpResponse.json({
        conversation: {
          ...current,
          isMember: current.members.some((m) => (m as { id: string }).id === alice.id),
        },
      }),
    ),
    http.get(`*/api/v1/conversations/${groupId}/messages`, () =>
      HttpResponse.json({ messages: [], hasMore: false }),
    ),
    http.get('*/api/v1/users/search', () => HttpResponse.json({ users: [dave] })),
    http.post(`*/api/v1/groups/${groupId}/members`, async ({ request }) => {
      const body = (await request.json()) as { userId: string };
      added.push(body);
      current = { ...current, members: [...current.members, dave] };
      return HttpResponse.json({ conversation: current }, { status: 201 });
    }),
    http.delete(`*/api/v1/groups/${groupId}/members/:userId`, ({ params }) => {
      removed.push(String(params['userId']));
      current = {
        ...current,
        members: current.members.filter((m) => (m as { id: string }).id !== params['userId']),
      };
      return HttpResponse.json({ conversation: current });
    }),
  );
  const setMembers = (members: unknown[]) => {
    current = { ...current, members, closed: members.length === 0 };
  };
  return { added, removed, setMembers };
}

beforeEach(() => {
  window.history.pushState({}, '', '/');
});

async function openGroupDetails(fake = fakeRealtime()) {
  render(<App createRealtime={() => fake.realtime} />);
  const user = userEvent.setup();
  await user.click(await screen.findByRole('button', { name: /Book Club/ }));
  await user.click(await screen.findByRole('button', { name: /group details/i }));
  const sheet = await screen.findByRole('dialog', { name: /book club/i });
  return { user, sheet, fake };
}

describe('Group details', () => {
  it('lists the Members and marks the Owner', async () => {
    signedIn(groupOwnedBy(alice.id, [aliceMember, bob, carol]));

    const { sheet } = await openGroupDetails();

    const items = await within(sheet).findAllByRole('listitem');
    expect(items.map((item) => item.textContent)).toEqual([
      expect.stringContaining('Alice'),
      expect.stringContaining('Bob'),
      expect.stringContaining('carol'),
    ]);
    expect(within(items[0]!).getByText('Owner')).toBeInTheDocument();
    expect(within(items[1]!).queryByText('Owner')).not.toBeInTheDocument();
  });

  it('lets the Owner add a Member, who appears in the list', async () => {
    const { added } = signedIn(groupOwnedBy(alice.id, [aliceMember, bob]));
    const { user, sheet } = await openGroupDetails();

    await user.type(await within(sheet).findByRole('combobox'), 'da');
    await user.click(await within(sheet).findByRole('option', { name: /dave/i }));

    expect(await within(sheet).findByText('dave')).toBeInTheDocument();
    expect(added).toEqual([{ userId: dave.id }]);
  });

  it('lets the Owner remove a Member after confirming', async () => {
    const { removed } = signedIn(groupOwnedBy(alice.id, [aliceMember, bob, carol]));
    const { user, sheet } = await openGroupDetails();

    await user.click(await within(sheet).findByRole('button', { name: /actions for bob/i }));
    await user.click(await screen.findByRole('menuitem', { name: /remove from group/i }));
    const confirm = await screen.findByRole('alertdialog');
    expect(removed).toEqual([]);
    await user.click(within(confirm).getByRole('button', { name: /^remove$/i }));

    await within(sheet).findByText('carol');
    expect(within(sheet).queryByText('Bob')).not.toBeInTheDocument();
    expect(removed).toEqual([bob.id]);
  });

  it('keeps the Member when the Owner cancels the confirmation', async () => {
    const { removed } = signedIn(groupOwnedBy(alice.id, [aliceMember, bob]));
    const { user, sheet } = await openGroupDetails();

    await user.click(await within(sheet).findByRole('button', { name: /actions for bob/i }));
    await user.click(await screen.findByRole('menuitem', { name: /remove from group/i }));
    const confirm = await screen.findByRole('alertdialog');
    await user.click(within(confirm).getByRole('button', { name: /cancel/i }));

    expect(within(sheet).getByText('Bob')).toBeInTheDocument();
    expect(removed).toEqual([]);
  });

  it('shows a Member who is not the Owner no way to manage Members', async () => {
    signedIn(groupOwnedBy(bob.id, [aliceMember, bob, carol]));

    const { sheet } = await openGroupDetails();

    await within(sheet).findByText('carol');
    expect(within(sheet).getByText('Owner')).toBeInTheDocument();
    expect(within(sheet).queryByRole('combobox')).not.toBeInTheDocument();
    expect(within(sheet).queryByRole('button', { name: /actions for/i })).not.toBeInTheDocument();
  });
});

const systemMessage = (
  sequence: number,
  kind: 'member_added' | 'member_removed' | 'member_left' | 'owner_changed',
  subject: { id: string; username: string; nickname: string | null },
) => ({
  id: `0198a2b4-7c3e-7a52-9f31-5d2f4c1e9${String(sequence).padStart(3, '0')}`,
  conversationId: groupId,
  senderId: bob.id,
  sequence,
  clientMessageId: `0198a2b4-7c3e-7a52-9f31-5d2f4d1e9${String(sequence).padStart(3, '0')}`,
  kind,
  body: '',
  subject,
  createdAt: '2020-03-05T10:00:00.000Z',
});

describe('System Messages', () => {
  it('shows stored System Messages from the history as Markers after a reload', async () => {
    signedIn(groupOwnedBy(bob.id, [aliceMember, bob]));
    server.use(
      http.get(`*/api/v1/conversations/${groupId}/messages`, () =>
        HttpResponse.json({
          messages: [
            systemMessage(4, 'owner_changed', carol),
            systemMessage(3, 'member_left', dave),
            systemMessage(2, 'member_removed', dave),
          ],
          hasMore: false,
        }),
      ),
    );
    render(<App createRealtime={() => fakeRealtime().realtime} />);
    const user = userEvent.setup();
    await user.click(await screen.findByRole('button', { name: /Book Club/ }));

    expect(await screen.findByText('dave was removed')).toBeInTheDocument();
    expect(screen.getByText('dave left')).toBeInTheDocument();
    expect(screen.getByText('carol is now the Owner')).toBeInTheDocument();
  });

  it('shows a pushed System Message once, and keeps the Member count current from the membership events', async () => {
    const { setMembers } = signedIn(groupOwnedBy(bob.id, [aliceMember, bob]));
    const fake = fakeRealtime();
    render(<App createRealtime={() => fake.realtime} />);
    const user = userEvent.setup();
    await user.click(await screen.findByRole('button', { name: /Book Club/ }));
    await screen.findByText('2 members');
    setMembers([aliceMember, bob, carol]);

    act(() => {
      fake.emit({ type: 'group.member_added', conversationId: groupId, member: carol });
      fake.emit({ type: 'message.created', message: systemMessage(2, 'member_added', carol) });
    });

    expect(await screen.findByText('carol was added')).toBeInTheDocument();
    expect(screen.getAllByText('carol was added')).toHaveLength(1);
    expect(await screen.findByText('3 members')).toBeInTheDocument();
    setMembers([aliceMember, bob]);

    act(() => {
      fake.emit({ type: 'group.member_removed', conversationId: groupId, member: carol });
      fake.emit({ type: 'message.created', message: systemMessage(3, 'member_removed', carol) });
    });

    expect(await screen.findByText('carol was removed')).toBeInTheDocument();
    expect(screen.getAllByText(/carol was/)).toHaveLength(2);
    expect(await screen.findByText('2 members')).toBeInTheDocument();
  });

  it('does not render a System Message from the membership event alone', async () => {
    const { setMembers } = signedIn(groupOwnedBy(bob.id, [aliceMember, bob]));
    const fake = fakeRealtime();
    render(<App createRealtime={() => fake.realtime} />);
    const user = userEvent.setup();
    await user.click(await screen.findByRole('button', { name: /Book Club/ }));
    await screen.findByText('2 members');
    setMembers([aliceMember, bob, carol]);

    act(() => fake.emit({ type: 'group.member_added', conversationId: groupId, member: carol }));

    expect(await screen.findByText('3 members')).toBeInTheDocument();
    expect(screen.queryByText('carol was added')).not.toBeInTheDocument();
  });

  it('does not let a System Message change the Conversation preview in the list', async () => {
    signedIn(groupOwnedBy(bob.id, [aliceMember, bob]));
    server.use(
      http.get('*/api/v1/conversations', () =>
        HttpResponse.json({
          conversations: [
            {
              ...groupOwnedBy(bob.id, [aliceMember, bob]),
              isMember: true,
              unreadCount: 0,
              lastMessage: {
                sequence: 1,
                senderId: bob.id,
                preview: 'hello everyone',
                createdAt: '2020-03-04T10:00:00.000Z',
              },
            },
          ],
        }),
      ),
    );
    const fake = fakeRealtime();
    render(<App createRealtime={() => fake.realtime} />);
    await screen.findByText('hello everyone');

    act(() =>
      fake.emit({ type: 'message.created', message: systemMessage(2, 'member_added', carol) }),
    );

    expect(screen.getByText('hello everyone')).toBeInTheDocument();
  });

  it('ignores membership changes of another Group', async () => {
    signedIn(groupOwnedBy(bob.id, [aliceMember, bob]));
    const fake = fakeRealtime();
    render(<App createRealtime={() => fake.realtime} />);
    const user = userEvent.setup();
    await user.click(await screen.findByRole('button', { name: /Book Club/ }));
    await screen.findByText('2 members');

    act(() =>
      fake.emit({
        type: 'group.member_added',
        conversationId: '0198a2b4-7c3e-7a52-9f31-5d2f4c1e8b99',
        member: carol,
      }),
    );

    expect(screen.queryByText(/was added/)).not.toBeInTheDocument();
    expect(screen.getByText('2 members')).toBeInTheDocument();
  });
});
