import {
  UserSearchResultSchema,
  type ConversationSummary,
  type User,
  type UserSearchResult,
} from '@chat/contracts';
import { ChevronsUpDown, LogOut, Moon, SquarePen, Sun, UserRound, Users } from 'lucide-react';
import { useEffect, useState } from 'react';
import { useLocation, useMatch, useNavigate } from 'react-router';
import { WifiOff } from 'lucide-react';
import { Alert, AlertDescription, AlertTitle } from '@/components/ui/alert';
import { Avatar, AvatarFallback } from '@/components/ui/avatar';
import { Button } from '@/components/ui/button';
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
} from '@/components/ui/dropdown-menu';
import {
  Sidebar,
  SidebarContent,
  SidebarFooter,
  SidebarGroup,
  SidebarGroupLabel,
  SidebarHeader,
  SidebarInset,
  SidebarMenu,
  SidebarMenuButton,
  SidebarMenuItem,
  SidebarProvider,
  SidebarTrigger,
} from '@/components/ui/sidebar';
import { useAuth } from '@/auth/AuthProvider';
import { useConnectionStatus } from '@/realtime/RealtimeProvider';
import { useTheme } from '@/theme/ThemeProvider';
import { ConversationList } from './ConversationList';
import { ConversationView } from './ConversationView';
import { RoutedConversation } from './RoutedConversation';
import { NewConversationDialog } from './NewConversationDialog';
import { NewGroupDialog } from './NewGroupDialog';
import { ProfileDialog } from './ProfileDialog';

/** Shown while the live connection is down; Messages missed meanwhile are filled in on return. */
function ConnectionAlert() {
  if (useConnectionStatus() !== 'disconnected') return null;
  return (
    <Alert variant="destructive" className="rounded-none border-x-0 border-t-0">
      <WifiOff />
      <AlertTitle>Connection lost</AlertTitle>
      <AlertDescription>
        Reconnecting. Missed messages will appear when it is back.
      </AlertDescription>
    </Alert>
  );
}

/** Whether this tab is visible, following the browser's `visibilitychange`. */
function useTabVisible(): boolean {
  const [visible, setVisible] = useState(() => document.visibilityState === 'visible');
  useEffect(() => {
    const update = () => setVisible(document.visibilityState === 'visible');
    document.addEventListener('visibilitychange', update);
    return () => document.removeEventListener('visibilitychange', update);
  }, []);
  return visible;
}

function UserMenu({ user }: { user: User }) {
  const { theme, setTheme } = useTheme();
  const [profileOpen, setProfileOpen] = useState(false);
  const { logOut } = useAuth();
  const name = user.nickname ?? user.username;
  return (
    <SidebarMenu>
      <ProfileDialog user={user} open={profileOpen} onOpenChange={setProfileOpen} />
      <SidebarMenuItem>
        <DropdownMenu>
          <DropdownMenuTrigger render={<SidebarMenuButton size="lg" />}>
            <Avatar className="size-8">
              <AvatarFallback>{name.slice(0, 2).toUpperCase()}</AvatarFallback>
            </Avatar>
            <span className="truncate font-medium">{name}</span>
            <ChevronsUpDown className="ml-auto size-4" />
          </DropdownMenuTrigger>
          <DropdownMenuContent side="top" align="start" className="min-w-56">
            <DropdownMenuItem onClick={() => setProfileOpen(true)}>
              <UserRound />
              Profile
            </DropdownMenuItem>
            <DropdownMenuItem onClick={() => setTheme(theme === 'dark' ? 'light' : 'dark')}>
              {theme === 'dark' ? <Sun /> : <Moon />}
              {theme === 'dark' ? 'Light theme' : 'Dark theme'}
            </DropdownMenuItem>
            <DropdownMenuItem onClick={() => void logOut()}>
              <LogOut />
              Log out
            </DropdownMenuItem>
          </DropdownMenuContent>
        </DropdownMenu>
      </SidebarMenuItem>
    </SidebarMenu>
  );
}

/**
 * A Direct view picked in the dialog, which has no Conversation id (and so no URL) until its
 * first Message. It lives in the history entry's state, so Back and Forward restore it.
 */
interface Draft {
  peer: UserSearchResult;
  conversationId?: string;
}

function draftOf(state: unknown): Draft | undefined {
  const field = (value: unknown, key: string): unknown =>
    typeof value === 'object' && value !== null && key in value
      ? Object.entries(value).find(([k]) => k === key)?.[1]
      : undefined;
  const raw = field(state, 'draft');
  const peer = UserSearchResultSchema.safeParse(field(raw, 'peer'));
  if (!peer.success) return undefined;
  const conversationId = field(raw, 'conversationId');
  return typeof conversationId === 'string'
    ? { peer: peer.data, conversationId }
    : { peer: peer.data };
}

/** The signed-in frame: the Conversation list in a sidebar (a sheet on mobile) beside the content. */
export function AppShell({ user }: { user: User }) {
  const [newConversationOpen, setNewConversationOpen] = useState(false);
  const [newGroupOpen, setNewGroupOpen] = useState(false);
  const [refreshKey, setRefreshKey] = useState(0);
  const [atLatest, setAtLatest] = useState(true);
  const [conversations, setConversations] = useState<ConversationSummary[]>();
  const tabVisible = useTabVisible();
  const navigate = useNavigate();
  const location = useLocation();
  const routeId = useMatch('/conversations/:id')?.params.id;
  const draft = routeId === undefined ? draftOf(location.state) : undefined;
  const openId = routeId ?? draft?.conversationId;
  // Open, visible and at the latest Message: what arrives there is read as it arrives.
  const readingId = tabVisible && atLatest ? openId : undefined;
  const entry = conversations?.find((c) => c.id === routeId);
  const header = (
    <div className="flex h-12 items-center border-b px-3 md:hidden">
      <SidebarTrigger />
    </div>
  );
  return (
    // h-svh: the message scroller sizes its spacer from its viewport, so the frame needs a
    // definite height; with only min-h-svh the pane grows with the spacer without bound.
    <SidebarProvider className="h-svh">
      <NewConversationDialog
        open={newConversationOpen}
        onOpenChange={setNewConversationOpen}
        onPick={(picked) => {
          void navigate('/', { state: { draft: { peer: picked } } });
          setNewConversationOpen(false);
        }}
      />
      <NewGroupDialog
        open={newGroupOpen}
        onOpenChange={setNewGroupOpen}
        onCreated={(group) => {
          void navigate(`/conversations/${group.id}`);
          setRefreshKey((k) => k + 1);
          setNewGroupOpen(false);
        }}
      />
      <Sidebar>
        <SidebarHeader>
          <div className="flex items-center justify-between">
            <span className="px-2 py-1 text-lg font-semibold">Chat</span>
            <Button
              variant="ghost"
              size="icon"
              aria-label="New conversation"
              onClick={() => setNewConversationOpen(true)}
            >
              <SquarePen />
            </Button>
            <Button
              variant="ghost"
              size="icon"
              aria-label="New group"
              onClick={() => setNewGroupOpen(true)}
            >
              <Users />
            </Button>
          </div>
        </SidebarHeader>
        <SidebarContent>
          <SidebarGroup>
            <SidebarGroupLabel>Conversations</SidebarGroupLabel>
            <ConversationList
              userId={user.id}
              selectedId={openId}
              readingId={readingId}
              refreshKey={refreshKey}
              onLoaded={setConversations}
              onSelect={(conversation) => {
                if (conversation.id !== openId) void navigate(`/conversations/${conversation.id}`);
              }}
            />
          </SidebarGroup>
        </SidebarContent>
        <SidebarFooter>
          <UserMenu user={user} />
        </SidebarFooter>
      </Sidebar>
      <SidebarInset>
        <ConnectionAlert />
        {routeId !== undefined ? (
          <div className="flex min-h-0 flex-1 flex-col">
            {header}
            <RoutedConversation
              key={routeId}
              user={user}
              id={routeId}
              entry={entry}
              onLeft={() => setRefreshKey((k) => k + 1)}
              onAtLatestChange={setAtLatest}
              reading={tabVisible && atLatest}
              onSent={() => setRefreshKey((k) => k + 1)}
            />
          </div>
        ) : draft ? (
          <div className="flex min-h-0 flex-1 flex-col">
            {header}
            <ConversationView
              key={draft.peer.id}
              user={user}
              target={{ kind: 'direct', peer: draft.peer }}
              conversationId={draft.conversationId}
              onLeft={() => setRefreshKey((k) => k + 1)}
              onAtLatestChange={setAtLatest}
              reading={tabVisible && atLatest}
              onSent={(conversationId) => {
                void navigate('/', {
                  replace: true,
                  state: { draft: { peer: draft.peer, conversationId } },
                });
                setRefreshKey((k) => k + 1);
              }}
            />
          </div>
        ) : (
          <>
            <header className="flex h-12 items-center gap-2 border-b px-3">
              <SidebarTrigger />
            </header>
            <main className="flex flex-1 items-center justify-center p-6 text-muted-foreground">
              Select a conversation to start chatting.
            </main>
          </>
        )}
      </SidebarInset>
    </SidebarProvider>
  );
}
