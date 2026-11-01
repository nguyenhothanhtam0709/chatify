import { UpdateProfileRequestSchema, type User } from '@chat/contracts';
import { useState, type FormEvent } from 'react';
import { useAuth } from '@/auth/AuthProvider';
import { Button } from '@/components/ui/button';
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog';
import { Field, FieldError, FieldGroup, FieldLabel } from '@/components/ui/field';
import { Input } from '@/components/ui/input';
import { Switch } from '@/components/ui/switch';

function ProfileForm({ user, onSaved }: { user: User; onSaved: () => void }) {
  const { updateProfile } = useAuth();
  const [value, setValue] = useState(user.nickname ?? '');
  const [shareReadReceipts, setShareReadReceipts] = useState(user.shareReadReceipts);
  const [error, setError] = useState<string>();
  const [submitting, setSubmitting] = useState(false);

  async function onSubmit(e: FormEvent) {
    e.preventDefault();
    // An empty (or all-whitespace) field clears the Nickname.
    const trimmed = value.trim();
    // The setting is sent only when it changed, so a Nickname edit alone stays a Nickname edit.
    const parsed = UpdateProfileRequestSchema.safeParse({
      nickname: trimmed === '' ? null : value,
      ...(shareReadReceipts !== user.shareReadReceipts && { shareReadReceipts }),
    });
    if (!parsed.success) {
      setError('Nickname must be 1-50 characters, without control characters.');
      return;
    }
    setError(undefined);
    setSubmitting(true);
    try {
      const result = await updateProfile(parsed.data);
      if (result.ok) onSaved();
      else setError(result.error);
    } finally {
      setSubmitting(false);
    }
  }

  return (
    <form onSubmit={(e) => void onSubmit(e)} noValidate className="grid gap-4">
      <dl className="grid gap-1 text-sm">
        <dt className="text-muted-foreground">Username</dt>
        <dd className="font-medium">{user.username}</dd>
        <dt className="mt-2 text-muted-foreground">Email</dt>
        <dd className="font-medium">{user.email}</dd>
      </dl>
      <FieldGroup>
        <Field data-invalid={error ? true : undefined}>
          <FieldLabel htmlFor="nickname">Nickname</FieldLabel>
          <Input
            id="nickname"
            value={value}
            onChange={(e) => setValue(e.target.value)}
            placeholder="Optional"
            aria-invalid={error ? true : undefined}
          />
          {error && <FieldError>{error}</FieldError>}
        </Field>
        <Field orientation="horizontal">
          <Switch
            id="share-read-receipts"
            checked={shareReadReceipts}
            onCheckedChange={setShareReadReceipts}
          />
          <FieldLabel htmlFor="share-read-receipts">Share read receipts</FieldLabel>
        </Field>
      </FieldGroup>
      <DialogFooter>
        <Button type="submit" disabled={submitting}>
          Save
        </Button>
      </DialogFooter>
    </form>
  );
}

/**
 * Shows the User's Username and email and lets them set, change or clear their Nickname and
 * turn sharing read receipts on or off.
 */
export function ProfileDialog({
  user,
  open,
  onOpenChange,
}: {
  user: User;
  open: boolean;
  onOpenChange: (open: boolean) => void;
}) {
  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent>
        <DialogHeader>
          <DialogTitle>Profile</DialogTitle>
          <DialogDescription>
            Your Username is permanent. Your Nickname is optional.
          </DialogDescription>
        </DialogHeader>
        {/* Mounted only while open, so closing discards unsaved edits. */}
        <ProfileForm user={user} onSaved={() => onOpenChange(false)} />
      </DialogContent>
    </Dialog>
  );
}
