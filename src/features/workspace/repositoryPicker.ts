import { ApiError, authClient } from '../auth/api'
import { UserFacingError } from '../../shared/presentation'

export const MAX_CONNECT = 20 // same limit as the server

export type CandidateState = 'AVAILABLE' | 'CONNECTED' | 'ADMIN_REQUIRED' | 'OTHER_TEAM'
export type SelectStatus = 'CONNECTED' | 'ALREADY_CONNECTED' | 'ADMIN_REQUIRED' | 'NOT_IN_LIST' | 'CONFLICT' | 'FAILED'
export interface Candidate { github_repository_id: number; owner_login: string; repository_name: string; is_private: boolean; state: CandidateState }
export interface CandidateList { items: Candidate[]; truncated: boolean; skipped_installations: number; expires_at: string; installation_url: string | null }
export interface SelectResult { github_repository_id: number; owner_login: string | null; repository_name: string | null; status: SelectStatus; repository_id: string | null }

export const stateReasons: Record<Exclude<CandidateState, 'AVAILABLE'>, string> = {
  CONNECTED: '이미 이 팀에 연결돼 있어요',
  ADMIN_REQUIRED: '저장소 관리자 권한이 필요해요',
  OTHER_TEAM: '다른 팀에 연결돼 있어요',
}
export const resultLabels: Record<SelectStatus, string> = {
  CONNECTED: '연결했어요',
  ALREADY_CONNECTED: '이미 연결돼 있어요',
  ADMIN_REQUIRED: '저장소 관리자 권한이 필요해요',
  NOT_IN_LIST: '불러온 목록에 없는 저장소예요',
  CONFLICT: '다른 팀에 이미 연결돼 있어요',
  FAILED: '연결하지 못했어요. 잠시 후 다시 시도해 주세요',
}
const states: CandidateState[] = ['AVAILABLE', 'CONNECTED', 'ADMIN_REQUIRED', 'OTHER_TEAM']
const statuses = Object.keys(resultLabels) as SelectStatus[]
const bad = () => new UserFacingError('저장소 목록 응답을 확인할 수 없어요. 잠시 후 다시 시도해 주세요.')
const record = (value: unknown): Record<string, unknown> => { if (!value || typeof value !== 'object' || Array.isArray(value)) throw bad(); return value as Record<string, unknown> }
const text = (value: unknown): string => { if (typeof value !== 'string') throw bad(); return value }

export function parseCandidates(value: unknown): CandidateList {
  const body = record(value)
  if (!Array.isArray(body.items) || typeof body.truncated !== 'boolean' || typeof body.skipped_installations !== 'number') throw bad()
  const items = body.items.map((raw): Candidate => {
    const item = record(raw)
    if (typeof item.github_repository_id !== 'number' || typeof item.is_private !== 'boolean' || !states.includes(item.state as CandidateState)) throw bad()
    return { github_repository_id: item.github_repository_id, owner_login: text(item.owner_login), repository_name: text(item.repository_name), is_private: item.is_private, state: item.state as CandidateState }
  })
  return { items, truncated: body.truncated, skipped_installations: body.skipped_installations, expires_at: text(body.expires_at), installation_url: typeof body.installation_url === 'string' ? body.installation_url : null }
}

export function parseResults(value: unknown): SelectResult[] {
  const body = record(value)
  if (!Array.isArray(body.results)) throw bad()
  return body.results.map((raw): SelectResult => {
    const item = record(raw)
    if (typeof item.github_repository_id !== 'number' || !statuses.includes(item.status as SelectStatus)) throw bad()
    return {
      github_repository_id: item.github_repository_id,
      owner_login: typeof item.owner_login === 'string' ? item.owner_login : null,
      repository_name: typeof item.repository_name === 'string' ? item.repository_name : null,
      status: item.status as SelectStatus,
      repository_id: typeof item.repository_id === 'string' ? item.repository_id : null,
    }
  })
}

const base = (workspaceId: string) => `/api/v1/workspaces/${encodeURIComponent(workspaceId)}/repositories`

export async function loadCandidates(workspaceId: string): Promise<CandidateList> {
  return parseCandidates(await authClient.request<unknown>(`${base(workspaceId)}/candidates`))
}

export async function connectSelected(workspaceId: string, ids: number[]): Promise<SelectResult[]> {
  return parseResults(await authClient.request<unknown>(`${base(workspaceId)}/connect-selected`, { method: 'POST', body: JSON.stringify({ github_repository_ids: ids }) }))
}

// Only the GitHub OAuth page of github.com is an acceptable destination.
export function githubAuthorizationUrl(value: unknown): string {
  const url = new URL(text(value))
  if (url.origin !== 'https://github.com' || url.pathname !== '/login/oauth/authorize') throw new UserFacingError('연결 주소를 확인할 수 없어요.')
  return url.href
}

export async function startConnect(workspaceId: string): Promise<string> {
  const start = record(await authClient.request<unknown>(`${base(workspaceId)}/connect`, { method: 'POST' }))
  return githubAuthorizationUrl(start.authorization_url)
}

export const isExpired = (error: unknown) => error instanceof ApiError && error.code === 'CANDIDATES_NOT_FOUND'

// Candidates grouped by owner, owners and names in a stable case-insensitive order.
export function groupByOwner(items: Candidate[]): { owner: string; items: Candidate[] }[] {
  const groups = new Map<string, Candidate[]>()
  for (const item of [...items].sort((a, b) => a.owner_login.localeCompare(b.owner_login, 'en', { sensitivity: 'base' }) || a.repository_name.localeCompare(b.repository_name, 'en', { sensitivity: 'base' }))) {
    groups.set(item.owner_login, [...(groups.get(item.owner_login) ?? []), item])
  }
  return [...groups].map(([owner, list]) => ({ owner, items: list }))
}

export function matches(item: Candidate, query: string): boolean {
  const needle = query.trim().toLowerCase()
  return !needle || `${item.owner_login}/${item.repository_name}`.toLowerCase().includes(needle)
}
