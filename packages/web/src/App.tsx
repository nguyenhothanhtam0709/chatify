import { BrowserRouter, Navigate, Outlet, Route, Routes, useLocation } from 'react-router';
import { AuthProvider, useAuth } from '@/auth/AuthProvider';
import { LoginPage } from '@/auth/LoginPage';
import { SignupPage } from '@/auth/SignupPage';
import { rememberReturnTo, returnToFrom } from '@/auth/return-to';
import { HealthPage } from '@/health/HealthPage';
import {
  RealtimeProvider,
  useRealtimeEvents,
  type CreateRealtime,
} from '@/realtime/RealtimeProvider';
import { noRealtime } from '@/realtime/events';
import { AppShell } from '@/shell/AppShell';
import { ThemeProvider } from '@/theme/ThemeProvider';

/**
 * Renders nothing while auth is loading; signed-out Users are sent to `/login`, remembering
 * where they were going in location state.
 */
function RequireSignedIn() {
  const { state } = useAuth();
  const location = useLocation();
  if (state.status === 'loading') return null;
  if (state.status === 'signedOut') {
    return <Navigate to="/login" replace state={rememberReturnTo(location)} />;
  }
  return <Outlet />;
}

/**
 * Renders nothing while auth is loading; signed-in Users are sent on to the location they were
 * going to before login, or `/`.
 */
function SignedOutOnly() {
  const { state } = useAuth();
  const location = useLocation();
  if (state.status === 'loading') return null;
  if (state.status === 'signedIn') return <Navigate to={returnToFrom(location.state)} replace />;
  return <Outlet />;
}

function SignedInShell() {
  const { state } = useAuth();
  return state.status === 'signedIn' ? <AppShell user={state.user} /> : null;
}

/**
 * `/signup` and `/health` are public; `/login` is for signed-out Users; everything else
 * is the app shell, which signed-out Users are sent away from.
 */
function AppRoutes() {
  return (
    <Routes>
      <Route path="/signup" element={<SignupPage />} />
      <Route path="/health" element={<HealthPage />} />
      <Route element={<SignedOutOnly />}>
        <Route path="/login" element={<LoginPage />} />
      </Route>
      <Route element={<RequireSignedIn />}>
        <Route path="*" element={<SignedInShell />} />
      </Route>
    </Routes>
  );
}

/** The server ended this session (e.g. logout in another tab): sign out and go to login. */
function SessionRevocationWatcher() {
  const { state, endSession } = useAuth();
  return state.status === 'signedIn' ? <WatchRevocation onRevoked={endSession} /> : null;
}

function WatchRevocation({ onRevoked }: { onRevoked: () => void }) {
  useRealtimeEvents((event) => {
    if (event.type === 'session.revoked') onRevoked();
  });
  return null;
}

const noConnection: CreateRealtime = () => noRealtime;

/** `createRealtime` is how server push is connected; without it nothing is pushed. */
export function App({ createRealtime = noConnection }: { createRealtime?: CreateRealtime }) {
  return (
    <ThemeProvider>
      <AuthProvider>
        <RealtimeProvider create={createRealtime}>
          <SessionRevocationWatcher />
          <BrowserRouter>
            <AppRoutes />
          </BrowserRouter>
        </RealtimeProvider>
      </AuthProvider>
    </ThemeProvider>
  );
}
