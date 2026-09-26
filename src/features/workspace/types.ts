export type PR = { id: string; pr_number: number; title: string; state: string; merge_status: string; is_draft?: boolean; author_login: string | null; head_sha: string | null; base_sha: string | null }
export type Review = { id: string; author: string | null; state: string; body: string; github_url: string }
