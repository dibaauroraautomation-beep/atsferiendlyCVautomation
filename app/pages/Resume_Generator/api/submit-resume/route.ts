import { NextRequest } from 'next/server'
import { jobs } from '../_store'

const N8N_WEBHOOK_URL = process.env.N8N_WEBHOOK_URL || 'https://n8naurora.duckdns.org/webhook/user-info'

export async function POST(request: NextRequest) {
  const jobId = crypto.randomUUID()
  const formData = await request.formData()
  const uniqueId = (formData.get('uniqueId') as string | null) ?? ''

  jobs.set(jobId, { status: 'pending', uniqueId })

  forwardToN8n(jobId, formData)

  return Response.json({ jobId })
}

function forwardToN8n(jobId: string, formData: FormData) {
  formData.append('jobId', jobId)

  // Fire-and-forget: n8n will callback via webhook-callback when done.
  // We keep a 20-min timeout so the fetch eventually resolves. On timeout
  // or network error we do NOT set error — n8n may still callback.
  const controller = new AbortController()
  const timeout = setTimeout(() => controller.abort(), 1_200_000)

  fetch(N8N_WEBHOOK_URL, { method: 'POST', body: formData, signal: controller.signal })
    .then(async (res) => {
      clearTimeout(timeout)
      if (!res.ok) return
      try {
        const data = await res.json()
        const result = Array.isArray(data) ? data[0] : data
        if (result && (typeof result.ats_score === 'number' || typeof result['ATS Score'] === 'number')) {
          jobs.set(jobId, { status: 'completed', result })
        }
      } catch { /* not JSON — n8n will callback */ }
    })
    .catch(() => { /* n8n will callback or client will timeout */ })
}
