import { z } from 'zod';
import { GroupSchema } from './message.js';
import { nameText } from './user.js';

export const GROUP_NAME_MAX = 100;

/** At most 256 Members including the Owner. */
export const GROUP_MEMBERS_MAX = 256;

/** Trimmed, NFC, 1-100 characters, no control or bidi-override characters. Not unique. */
export const GroupNameSchema = nameText(true).refine(
  (value) => {
    const length = Array.from(value).length;
    return length >= 1 && length <= GROUP_NAME_MAX;
  },
  { message: `must be 1-${GROUP_NAME_MAX} characters` },
);

/**
 * `POST /groups`. The caller becomes the Owner and a Member; `memberIds` are the other initial
 * Members. The 256-Member cap is a domain rule (`GROUP_FULL`), not a validation error.
 */
export const CreateGroupRequestSchema = z.object({
  name: GroupNameSchema,
  memberIds: z.array(z.uuid()),
});

export type CreateGroupRequest = z.input<typeof CreateGroupRequestSchema>;

export const CreateGroupResponseSchema = z.object({ conversation: GroupSchema });

export type CreateGroupResponse = z.infer<typeof CreateGroupResponseSchema>;

/** `POST /groups/:id/members`: the Owner adds a User, who becomes a Member at once. */
export const AddGroupMemberRequestSchema = z.object({ userId: z.uuid() });

export type AddGroupMemberRequest = z.input<typeof AddGroupMemberRequestSchema>;

/** The Group as it is after a Member was added or removed. */
export const GroupMembershipResponseSchema = z.object({ conversation: GroupSchema });

export type GroupMembershipResponse = z.infer<typeof GroupMembershipResponseSchema>;
