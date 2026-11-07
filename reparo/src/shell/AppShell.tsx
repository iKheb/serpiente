// STUB — será reemplazado por el subagente de Shell/UI.
import type { ReactNode } from 'react';
import type { Route } from '@/app/router';
export function AppShell({ children }: { route: Route; children: ReactNode }) {
  return <main>{children}</main>;
}
