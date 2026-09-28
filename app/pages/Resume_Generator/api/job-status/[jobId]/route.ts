import { jobs } from '../../_store'

export async function GET(
  _request: Request,
  { params }: { params: Promise<{ jobId: string }> }
) {
  const { jobId } = await params
  const job = jobs.get(jobId)
  if (!job) {
    return Response.json({ error: 'Job not found' }, { status: 404 })
  }
  return Response.json(job)
}
