import { SearchUsersQuerySchema, type UserSearchResult } from '@chat/contracts';
import { useEffect, useState } from 'react';
import { useAuth } from '@/auth/auth-context';
import { Command, CommandInput, CommandItem, CommandList } from '@/components/ui/command';
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog';

const DEBOUNCE_MS = 200;

type SearchState =
  | { status: 'idle' }
  | { status: 'loading' }
  | { status: 'done'; users: UserSearchResult[] }
  | { status: 'error'; error: string };

/** Results for `query`, fetched from the server (no client-side filtering), latest query wins. */
function useUserSearch(query: string): SearchState {
  const { searchUsers } = useAuth();
  const [state, setState] = useState<SearchState>({ status: 'idle' });

  useEffect(() => {
    if (!SearchUsersQuerySchema.safeParse({ q: query }).success) {
      setState({ status: 'idle' });
      return;
    }
    setState({ status: 'loading' });
    const controller = new AbortController();
    const timer = setTimeout(() => {
      void searchUsers(query, controller.signal).then((result) => {
        if (controller.signal.aborted) return;
        setState(
          result.ok
            ? { status: 'done', users: result.users }
            : { status: 'error', error: result.error },
        );
      });
    }, DEBOUNCE_MS);
    return () => {
      clearTimeout(timer);
      controller.abort();
    };
  }, [query, searchUsers]);

  return state;
}

/** Username-prefix search in a `Command` list; `onPick` gets the chosen User. */
export function UserSearchCombobox({
  onPick,
  autoFocus = true,
}: {
  onPick: (user: UserSearchResult) => void;
  autoFocus?: boolean;
}) {
  const [query, setQuery] = useState('');
  const state = useUserSearch(query);
  const users = state.status === 'done' ? state.users : [];

  return (
    // The server does the matching and ranking, so cmdk's own filtering is off.
    <Command shouldFilter={false} className="border">
      <CommandInput
        aria-label="Username"
        placeholder="Search by Username"
        autoComplete="off"
        autoFocus={autoFocus}
        value={query}
        onValueChange={setQuery}
      />
      <CommandList aria-label="Matching users" className="min-h-24">
        {state.status === 'idle' && (
          <p className="p-2 text-sm text-muted-foreground">Type at least 2 characters to search.</p>
        )}
        {state.status === 'loading' && (
          <p role="status" className="p-2 text-sm text-muted-foreground">
            Searching…
          </p>
        )}
        {state.status === 'error' && (
          <p role="alert" className="p-2 text-sm text-destructive">
            {state.error}
          </p>
        )}
        {state.status === 'done' && users.length === 0 && (
          <p className="p-2 text-sm text-muted-foreground">No users found.</p>
        )}
        {users.map((u) => (
          <CommandItem key={u.id} value={u.id} onSelect={() => onPick(u)}>
            {u.nickname !== null ? (
              <>
                <span className="font-medium">{u.nickname}</span>
                <span className="text-muted-foreground">@{u.username}</span>
              </>
            ) : (
              <span className="font-medium">{u.username}</span>
            )}
          </CommandItem>
        ))}
      </CommandList>
    </Command>
  );
}

/**
 * Pick a User to talk to by typing the start of their Username. Results come from the server.
 * What happens after picking (starting the Direct Conversation) is a later ticket.
 */
export function NewConversationDialog({
  open,
  onOpenChange,
  onPick,
}: {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  onPick: (user: UserSearchResult) => void;
}) {
  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent>
        <DialogHeader>
          <DialogTitle>New conversation</DialogTitle>
          <DialogDescription>Find a person by the start of their Username.</DialogDescription>
        </DialogHeader>
        {/* Mounted only while open, so closing discards the query. */}
        <UserSearchCombobox onPick={onPick} />
      </DialogContent>
    </Dialog>
  );
}
