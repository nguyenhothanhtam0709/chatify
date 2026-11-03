import type { ReactNode } from 'react';
import { Skeleton } from '@/components/ui/skeleton';

/** The placeholder a URL's view shows while it looks up what the URL names. */
export function LoadingConversation() {
  return (
    <div
      role="status"
      aria-label="Loading conversation"
      className="flex h-12 items-center border-b px-4"
    >
      <Skeleton className="h-5 w-40" />
    </div>
  );
}

/** The message a URL's view shows when what the URL names can't be shown. */
export function Unreachable({ children }: { children: ReactNode }) {
  return (
    <main className="flex flex-1 items-center justify-center p-6 text-center text-muted-foreground">
      {children}
    </main>
  );
}
