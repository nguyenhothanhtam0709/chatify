import {
  CreateGroupResponseSchema,
  GetConversationResponseSchema,
  GroupMembershipResponseSchema,
  ErrorCode,
  ErrorResponseSchema,
  type CreateGroupRequest,
  type GetConversationResponse,
  type Group,
} from '@chat/contracts';

export type CreateGroupResult = { ok: true; group: Group } | { ok: false; error: string };

/** `POST /api/v1/groups`: the caller becomes the Owner. */
export async function createGroup(
  accessToken: string,
  request: CreateGroupRequest,
): Promise<CreateGroupResult> {
  let res: Response;
  try {
    res = await fetch(new URL('/api/v1/groups', window.location.origin), {
      method: 'POST',
      headers: { 'content-type': 'application/json', authorization: `Bearer ${accessToken}` },
      body: JSON.stringify(request),
    });
  } catch {
    return { ok: false, error: 'Could not reach the server. Try again.' };
  }
  const payload: unknown = await res.json().catch(() => undefined);
  if (res.ok) return { ok: true, group: CreateGroupResponseSchema.parse(payload).conversation };
  const code = ErrorResponseSchema.safeParse(payload).data?.error.code;
  if (code === ErrorCode.GROUP_FULL) {
    return { ok: false, error: 'A Group can have at most 256 Members.' };
  }
  if (code === ErrorCode.USER_NOT_FOUND) {
    return { ok: false, error: 'One of the chosen people no longer exists.' };
  }
  if (code === ErrorCode.VALIDATION_FAILED) {
    return { ok: false, error: 'That Group name is not allowed. Use 1-100 plain characters.' };
  }
  return { ok: false, error: 'Something went wrong. Try again.' };
}

export type GroupResult<G extends Group = Group> =
  { ok: true; group: G } | { ok: false; error: string };

/** A Group as `GET /conversations/:id` tells it to the caller (adds `isMember`). */
export type GroupDetail = Extract<GetConversationResponse['conversation'], { kind: 'group' }>;

const GENERIC_ERROR = 'Something went wrong. Try again.';
const UNREACHABLE = 'Could not reach the server. Try again.';

/** `GET /api/v1/conversations/:id` for a Group: its Members and Owner. */
export async function getGroup(
  accessToken: string,
  groupId: string,
  signal?: AbortSignal,
): Promise<GroupResult<GroupDetail>> {
  let res: Response;
  try {
    res = await fetch(new URL(`/api/v1/conversations/${groupId}`, window.location.origin), {
      headers: { authorization: `Bearer ${accessToken}` },
      signal: signal ?? null,
    });
  } catch {
    return { ok: false, error: UNREACHABLE };
  }
  if (!res.ok) return { ok: false, error: GENERIC_ERROR };
  const { conversation } = GetConversationResponseSchema.parse(await res.json());
  return conversation.kind === 'group'
    ? { ok: true, group: conversation }
    : { ok: false, error: GENERIC_ERROR };
}

async function changeMembers(
  accessToken: string,
  groupId: string,
  method: 'POST' | 'DELETE',
  path: string,
  body: object | undefined,
): Promise<GroupResult> {
  let res: Response;
  try {
    res = await fetch(new URL(`/api/v1/groups/${groupId}/members${path}`, window.location.origin), {
      method,
      headers: {
        authorization: `Bearer ${accessToken}`,
        ...(body ? { 'content-type': 'application/json' } : {}),
      },
      ...(body ? { body: JSON.stringify(body) } : {}),
    });
  } catch {
    return { ok: false, error: UNREACHABLE };
  }
  const payload: unknown = await res.json().catch(() => undefined);
  if (res.ok) return { ok: true, group: GroupMembershipResponseSchema.parse(payload).conversation };
  const code = ErrorResponseSchema.safeParse(payload).data?.error.code;
  if (code === ErrorCode.ALREADY_A_MEMBER)
    return { ok: false, error: 'They are already a Member.' };
  if (code === ErrorCode.GROUP_FULL) {
    return { ok: false, error: 'A Group can have at most 256 Members.' };
  }
  if (code === ErrorCode.USER_NOT_FOUND)
    return { ok: false, error: 'That person no longer exists.' };
  if (code === ErrorCode.NOT_GROUP_OWNER) {
    return { ok: false, error: 'Only the Owner can change the Members.' };
  }
  if (code === ErrorCode.OWNER_CANNOT_BE_REMOVED) {
    return { ok: false, error: 'The Owner cannot be removed from their Group.' };
  }
  if (code === ErrorCode.NOT_A_MEMBER) return { ok: false, error: 'They are no longer a Member.' };
  return { ok: false, error: GENERIC_ERROR };
}

/** `POST /api/v1/groups/:id/leave`: any Member; the Group as it is after they left. */
export async function leaveGroup(accessToken: string, groupId: string): Promise<GroupResult> {
  let res: Response;
  try {
    res = await fetch(new URL(`/api/v1/groups/${groupId}/leave`, window.location.origin), {
      method: 'POST',
      headers: { authorization: `Bearer ${accessToken}` },
    });
  } catch {
    return { ok: false, error: UNREACHABLE };
  }
  const payload: unknown = await res.json().catch(() => undefined);
  if (res.ok) return { ok: true, group: GroupMembershipResponseSchema.parse(payload).conversation };
  const code = ErrorResponseSchema.safeParse(payload).data?.error.code;
  if (code === ErrorCode.GROUP_CLOSED) return { ok: false, error: 'This Group is closed.' };
  if (code === ErrorCode.NOT_A_MEMBER) return { ok: false, error: 'You already left this Group.' };
  return { ok: false, error: GENERIC_ERROR };
}

/** `POST /api/v1/groups/:id/members`: Owner only. */
export const addGroupMember = (accessToken: string, groupId: string, userId: string) =>
  changeMembers(accessToken, groupId, 'POST', '', { userId });

/** `DELETE /api/v1/groups/:id/members/:userId`: Owner only. */
export const removeGroupMember = (accessToken: string, groupId: string, userId: string) =>
  changeMembers(accessToken, groupId, 'DELETE', `/${userId}`, undefined);
