import type { ConversationSummary, User } from '@chat/contracts';
import { ChevronsUpDown, LogOut, Moon, SquarePen, Sun, UserRound, Users } from 'lucide-react';
import { useEffect, useState } from 'react';
import { useMatch, useNavigate } from 'react-router';
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
import { RoutedConversation } from './RoutedConversation';
import { RoutedDirect } from './RoutedDirect';
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

/** The signed-in frame: the Conversation list in a sidebar (a sheet on mobile) beside the content. */
export function AppShell({ user }: { user: User }) {
  const [newConversationOpen, setNewConversationOpen] = useState(false);
  const [newGroupOpen, setNewGroupOpen] = useState(false);
  const [refreshKey, setRefreshKey] = useState(0);
  const [atLatest, setAtLatest] = useState(true);
  const [conversations, setConversations] = useState<ConversationSummary[]>();
  const tabVisible = useTabVisible();
  const navigate = useNavigate();
  const routeId = useMatch('/conversations/:id')?.params.id;
  const directUserId = useMatch('/direct/:userId')?.params.userId;
  const openId = routeId;
  // A Direct view whose first Message started the Conversation keeps its mounted view under the
  // new `/conversations/:id` URL, so the composer keeps its focus and the Messages stay put.
  const [started, setStarted] = useState<{ userId: string; conversationId: string }>();
  const directKey =
    directUserId ??
    (started !== undefined && started.conversationId === routeId ? started.userId : undefined);
  useEffect(() => {
    // Until the location has moved on, the Direct URL is still the one showing.
    if (started === undefined || directUserId !== undefined) return;
    if (started.conversationId !== routeId) setStarted(undefined);
  }, [started, routeId, directUserId]);
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
          // Already in the Conversation this User's Direct view started: it is the one showing.
          const showing = started?.userId === picked.id && started.conversationId === routeId;
          if (!showing) void navigate(`/direct/${picked.id}`);
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
        {directKey !== undefined ? (
          <div className="flex min-h-0 flex-1 flex-col">
            {header}
            <RoutedDirect
              key={directKey}
              user={user}
              userId={directKey}
              onExisting={(id) => void navigate(`/conversations/${id}`, { replace: true })}
              onStarted={(id) => {
                setStarted({ userId: directKey, conversationId: id });
                void navigate(`/conversations/${id}`, { replace: true });
                setRefreshKey((k) => k + 1);
              }}
              onAtLatestChange={setAtLatest}
              reading={tabVisible && atLatest}
            />
          </div>
        ) : routeId !== undefined ? (
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
