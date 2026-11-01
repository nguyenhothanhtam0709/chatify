import type { Group, User, UserSearchResult } from '@chat/contracts';
import { EllipsisVertical, LogOut, UserMinus } from 'lucide-react';
import { useCallback, useEffect, useState } from 'react';
import { useAuth } from '@/auth/AuthProvider';
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
} from '@/components/ui/alert-dialog';
import { Avatar, AvatarFallback } from '@/components/ui/avatar';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
} from '@/components/ui/dropdown-menu';
import {
  Sheet,
  SheetContent,
  SheetDescription,
  SheetHeader,
  SheetTitle,
} from '@/components/ui/sheet';
import { useRealtimeEvents } from '@/realtime/RealtimeProvider';
import { displayName } from './conversation-target';
import { UserSearchCombobox } from './NewConversationDialog';

/**
 * A Group's Members, with the Owner marked. Only the Owner can add Users (by Username search)
 * and remove Members (after confirming); everyone else just reads the list.
 */
export function GroupDetailsSheet({
  groupId,
  user,
  open,
  onOpenChange,
  onLeft,
}: {
  groupId: string;
  user: User;
  open: boolean;
  onOpenChange: (open: boolean) => void;
  /** Called with the Group as it is after the User left it. */
  onLeft?: (group: Group) => void;
}) {
  const { getGroup, addGroupMember, removeGroupMember, leaveGroup } = useAuth();
  const [group, setGroup] = useState<Group>();
  const [error, setError] = useState<string>();
  const [removing, setRemoving] = useState<UserSearchResult>();
  const [busy, setBusy] = useState(false);
  const [leaving, setLeaving] = useState(false);

  useEffect(() => {
    if (!open) return;
    const controller = new AbortController();
    void (async () => {
      const result = await getGroup(groupId, controller.signal);
      if (controller.signal.aborted) return;
      if (result.ok) setGroup(result.group);
      else setError(result.error);
    })();
    return () => controller.abort();
  }, [open, groupId, getGroup]);

  useRealtimeEvents(
    useCallback(
      (event) => {
        if (event.type === 'group.membership_ended') {
          if (event.conversationId !== groupId) return;
          setGroup(
            (current) =>
              current && { ...current, members: current.members.filter((m) => m.id !== user.id) },
          );
          return;
        }
        if (event.type === 'group.owner_changed') {
          if (event.conversationId !== groupId) return;
          setGroup((current) => current && { ...current, ownerId: event.ownerId });
          return;
        }
        if (
          event.type !== 'group.member_added' &&
          event.type !== 'group.member_removed' &&
          event.type !== 'group.member_left'
        ) {
          return;
        }
        if (event.conversationId !== groupId) return;
        const { member } = event;
        setGroup((current) => {
          if (!current) return current;
          const others = current.members.filter((m) => m.id !== member.id);
          return {
            ...current,
            members: event.type === 'group.member_added' ? [...others, member] : others,
          };
        });
      },
      [groupId],
    ),
  );

  async function change(action: () => ReturnType<typeof addGroupMember>) {
    setBusy(true);
    setError(undefined);
    const result = await action();
    setBusy(false);
    if (result.ok) setGroup(result.group);
    else setError(result.error);
    return result.ok;
  }

  const isMember = group?.members.some((m) => m.id === user.id) ?? false;
  const isOwner = isMember && group?.ownerId === user.id;

  return (
    <Sheet open={open} onOpenChange={onOpenChange}>
      <SheetContent>
        <SheetHeader>
          <SheetTitle>{group?.name ?? 'Group'}</SheetTitle>
          <SheetDescription>
            {!group
              ? 'Loading members'
              : isMember
                ? `${group.members.length} ${group.members.length === 1 ? 'member' : 'members'}`
                : 'Only members can see who is in this group.'}
          </SheetDescription>
        </SheetHeader>
        <div className="grid min-h-0 flex-1 content-start gap-4 overflow-y-auto px-4 pb-4">
          {error && (
            <p role="alert" className="text-sm text-destructive">
              {error}
            </p>
          )}
          {group && isOwner && (
            <div className="grid gap-2">
              <h3 className="text-sm font-medium">Add a member</h3>
              {/* Re-mounted after each add so the query clears. */}
              <UserSearchCombobox
                key={group.members.length}
                autoFocus={false}
                onPick={(picked) => void change(() => addGroupMember(groupId, picked.id))}
              />
            </div>
          )}
          {group && isMember && (
            <Button variant="outline" disabled={busy} onClick={() => setLeaving(true)}>
              <LogOut />
              Leave group
            </Button>
          )}
          {group && isMember && (
            <ul aria-label="Members" className="grid gap-1">
              {group.members.map((member) => (
                <li key={member.id} className="flex items-center gap-2 rounded-md py-1">
                  <Avatar className="size-8">
                    <AvatarFallback>{displayName(member).slice(0, 2).toUpperCase()}</AvatarFallback>
                  </Avatar>
                  <span className="min-w-0 flex-1 truncate">{displayName(member)}</span>
                  {member.id === group.ownerId && <Badge variant="secondary">Owner</Badge>}
                  {isOwner && member.id !== group.ownerId && (
                    <DropdownMenu>
                      <DropdownMenuTrigger
                        render={
                          <Button
                            variant="ghost"
                            size="icon-sm"
                            aria-label={`Actions for ${displayName(member)}`}
                          />
                        }
                      >
                        <EllipsisVertical />
                      </DropdownMenuTrigger>
                      <DropdownMenuContent align="end">
                        <DropdownMenuItem variant="destructive" onClick={() => setRemoving(member)}>
                          <UserMinus />
                          Remove from group
                        </DropdownMenuItem>
                      </DropdownMenuContent>
                    </DropdownMenu>
                  )}
                </li>
              ))}
            </ul>
          )}
        </div>
        <AlertDialog open={leaving} onOpenChange={setLeaving}>
          <AlertDialogContent>
            <AlertDialogHeader>
              <AlertDialogTitle>Leave this group?</AlertDialogTitle>
              <AlertDialogDescription>
                You will no longer be able to send Messages to it, but you can still read what was
                said while you were a Member.
              </AlertDialogDescription>
            </AlertDialogHeader>
            <AlertDialogFooter>
              <AlertDialogCancel>Cancel</AlertDialogCancel>
              <AlertDialogAction
                variant="destructive"
                disabled={busy}
                onClick={() =>
                  void (async () => {
                    setBusy(true);
                    setError(undefined);
                    const result = await leaveGroup(groupId);
                    setBusy(false);
                    setLeaving(false);
                    if (!result.ok) {
                      setError(result.error);
                      return;
                    }
                    setGroup(result.group);
                    onLeft?.(result.group);
                  })()
                }
              >
                Leave
              </AlertDialogAction>
            </AlertDialogFooter>
          </AlertDialogContent>
        </AlertDialog>
        <AlertDialog
          open={removing !== undefined}
          onOpenChange={(o) => !o && setRemoving(undefined)}
        >
          <AlertDialogContent>
            <AlertDialogHeader>
              <AlertDialogTitle>Remove {removing && displayName(removing)}?</AlertDialogTitle>
              <AlertDialogDescription>
                They will no longer be able to send Messages to this Group.
              </AlertDialogDescription>
            </AlertDialogHeader>
            <AlertDialogFooter>
              <AlertDialogCancel>Cancel</AlertDialogCancel>
              <AlertDialogAction
                variant="destructive"
                disabled={busy}
                onClick={() =>
                  void (async () => {
                    if (!removing) return;
                    const target = removing;
                    await change(() => removeGroupMember(groupId, target.id));
                    setRemoving(undefined);
                  })()
                }
              >
                Remove
              </AlertDialogAction>
            </AlertDialogFooter>
          </AlertDialogContent>
        </AlertDialog>
      </SheetContent>
    </Sheet>
  );
}
