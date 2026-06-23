/** Typed fetch wrappers around the server `/api/*` endpoints. */

import type {
  ClaimCommanderResponse,
  CommanderXrayResponse,
  ClientSession,
  ClueResponse,
  RetryTargetResponse,
  StateResponse,
  VetoResponse,
  VoteResponse,
} from '../shared/api';

async function post<T>(path: string, body?: unknown): Promise<T> {
  const res = await fetch(path, {
    method: 'POST',
    headers: { 'content-type': 'application/json' },
    body: body ? JSON.stringify(body) : undefined,
  });
  return (await res.json()) as T;
}

async function get<T>(path: string): Promise<T> {
  const res = await fetch(path);
  return (await res.json()) as T;
}

export const fwApi = {
  init: () => get<ClientSession>('/api/init'),
  state: () => get<StateResponse>('/api/state'),
  retryTarget: () => get<RetryTargetResponse>('/api/retry-target'),
  vote: (tileId: string) => post<VoteResponse>('/api/vote', { tileId }),
  clue: (word: string, count: number) => post<ClueResponse>('/api/clue', { word, count }),
  veto: () => post<VetoResponse>('/api/veto'),
  claimCommander: () => post<ClaimCommanderResponse>('/api/claim-commander'),
  commanderXray: () => get<CommanderXrayResponse>('/api/commander-xray'),
};
