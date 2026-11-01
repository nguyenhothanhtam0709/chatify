import { GroupNameSchema, type Group, type UserSearchResult } from '@chat/contracts';
import { X } from 'lucide-react';
import { useId, useState, type FormEvent } from 'react';
import { useAuth } from '@/auth/AuthProvider';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog';
import { Field, FieldDescription, FieldError, FieldLabel } from '@/components/ui/field';
import { Input } from '@/components/ui/input';
import { displayName } from './conversation-target';
import { UserSearchCombobox } from './NewConversationDialog';

function NewGroupForm({ onCreated }: { onCreated: (group: Group) => void }) {
  const { createGroup } = useAuth();
  const nameId = useId();
  const [name, setName] = useState('');
  const [members, setMembers] = useState<UserSearchResult[]>([]);
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState<string>();
  const valid = GroupNameSchema.safeParse(name).success;

  function pick(user: UserSearchResult) {
    setMembers((current) => (current.some((m) => m.id === user.id) ? current : [...current, user]));
  }

  async function submit(e: FormEvent) {
    e.preventDefault();
    if (!valid || submitting) return;
    setSubmitting(true);
    setError(undefined);
    const result = await createGroup({
      name: GroupNameSchema.parse(name),
      memberIds: members.map((m) => m.id),
    });
    setSubmitting(false);
    if (result.ok) onCreated(result.group);
    else setError(result.error);
  }

  return (
    <form onSubmit={(e) => void submit(e)} className="grid gap-4">
      <Field>
        <FieldLabel htmlFor={nameId}>Group name</FieldLabel>
        <Input
          id={nameId}
          autoFocus
          autoComplete="off"
          value={name}
          onChange={(e) => setName(e.target.value)}
        />
        <FieldDescription>1 to 100 characters.</FieldDescription>
      </Field>
      <Field>
        <FieldLabel>Members</FieldLabel>
        {members.length > 0 && (
          <ul aria-label="Chosen Members" className="flex flex-wrap gap-1">
            {members.map((member) => (
              <li key={member.id}>
                <Badge variant="secondary">
                  {displayName(member)}
                  <button
                    type="button"
                    aria-label={`Remove ${displayName(member)}`}
                    onClick={() =>
                      setMembers((current) => current.filter((m) => m.id !== member.id))
                    }
                  >
                    <X />
                  </button>
                </Badge>
              </li>
            ))}
          </ul>
        )}
        {/* Re-mounted after each pick so the query clears. */}
        <UserSearchCombobox key={members.length} autoFocus={members.length > 0} onPick={pick} />
      </Field>
      {error && <FieldError role="alert">{error}</FieldError>}
      <DialogFooter>
        <Button type="submit" disabled={!valid || submitting}>
          Create group
        </Button>
      </DialogFooter>
    </form>
  );
}

/** Name a Group and choose its initial Members by searching Usernames. */
export function NewGroupDialog({
  open,
  onOpenChange,
  onCreated,
}: {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  onCreated: (group: Group) => void;
}) {
  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent>
        <DialogHeader>
          <DialogTitle>New group</DialogTitle>
          <DialogDescription>
            Name the Group and add people. You will be its Owner.
          </DialogDescription>
        </DialogHeader>
        {/* Mounted only while open, so closing discards the form. */}
        <NewGroupForm onCreated={onCreated} />
      </DialogContent>
    </Dialog>
  );
}
