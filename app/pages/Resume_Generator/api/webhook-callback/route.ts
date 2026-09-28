import { NextRequest } from 'next/server'
import { jobs } from '../_store'

export async function POST(request: NextRequest) {
  const data = await request.json()
  const body = Array.isArray(data) ? data[0] : data

  if (!body) {
    return Response.json({ error: 'empty body' }, { status: 400 })
  }

  const { jobId, result, error } = body as Record<string, unknown>
  const finalResult = result ?? body

  const targetId = jobId ? String(jobId) : null

  for (const [jid, entry] of jobs) {
    if (entry.status !== 'pending') continue
    if (targetId && jid !== targetId) continue

    if (error) {
      jobs.set(jid, { status: 'error', error: String(error) })
    } else {
      jobs.set(jid, { status: 'completed', result: finalResult })
    }

    if (targetId) break
  }

  return Response.json({ ok: true })
}
