import { useMemo, type ReactNode } from 'react';
import { useAuth } from '@/auth/auth-context';
import { RealtimeContext, type CreateRealtime } from './realtime-context';

export function RealtimeProvider({
  create,
  children,
}: {
  create: CreateRealtime;
  children: ReactNode;
}) {
  const { getAccessToken } = useAuth();
  const realtime = useMemo(() => create(getAccessToken), [create, getAccessToken]);
  return <RealtimeContext.Provider value={realtime}>{children}</RealtimeContext.Provider>;
}
