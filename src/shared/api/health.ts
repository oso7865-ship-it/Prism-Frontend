export async function checkReadiness(fetcher: typeof fetch = fetch): Promise<boolean> {
  const response = await fetcher('/health/ready', {
    cache: 'no-store', signal: AbortSignal.timeout(5000),
  })
  if (response.status === 503) return false
  if (!response.ok) throw new Error('Health request failed')
  const body: unknown = await response.json()
  if (!body || typeof body !== 'object' || !('status' in body) || body.status !== 'ready') {
    throw new Error('Invalid health response')
  }
  return true
}
