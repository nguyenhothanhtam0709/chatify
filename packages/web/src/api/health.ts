import { HealthResponseSchema, type HealthResponse } from '@chat/contracts';

/** Calls `GET /api/v1/health`. Any failure (network, bad status, bad shape) counts as unhealthy. */
export async function fetchHealth(signal?: AbortSignal): Promise<HealthResponse> {
  const res = await fetch(new URL('/api/v1/health', window.location.origin), {
    signal: signal ?? null,
  });
  const parsed = HealthResponseSchema.parse(await res.json());
  if (!res.ok) throw new Error(`Unhealthy: ${parsed.database}`);
  return parsed;
}
