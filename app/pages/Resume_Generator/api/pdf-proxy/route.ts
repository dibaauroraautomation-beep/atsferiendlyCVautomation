import { NextRequest } from 'next/server'

export async function GET(request: NextRequest) {
  const url = request.nextUrl.searchParams.get('url')
  if (!url) {
    return new Response('Missing url parameter', { status: 400 })
  }

  // Extract file ID from Google Drive URL
  const fileId =
    url.match(/[?&]id=([^&]+)/)?.[1] ??
    url.match(/\/d\/([^/]+)/)?.[1]

  // Try multiple URL formats to bypass Google's interstitial
  const urlsToTry = fileId
    ? [
        `https://drive.google.com/uc?export=view&id=${fileId}`,
        `https://drive.google.com/uc?id=${fileId}&confirm=1`,
        `https://drive.google.com/uc?export=download&id=${fileId}&confirm=t`,
      ]
    : [url]

  for (const attemptUrl of urlsToTry) {
    try {
      const res = await fetch(attemptUrl, {
        headers: { 'User-Agent': 'Mozilla/5.0' },
      })

      if (!res.ok) continue

      const contentType = res.headers.get('content-type') ?? ''
      const blob = await res.blob()

      // Skip if Google returned an HTML interstitial
      if (contentType.includes('text/html')) continue

      const headers = new Headers()
      headers.set('Content-Type', 'application/pdf')
      headers.set('Content-Disposition', 'inline')
      headers.set('X-Frame-Options', 'SAMEORIGIN')
      headers.set('Cache-Control', 'public, max-age=3600')

      return new Response(blob, { status: 200, headers })
    } catch {
      continue
    }
  }

  return new Response(
    `<html><body style="display:flex;align-items:center;justify-content:center;font-family:sans-serif;color:#6B7280;font-size:14px;margin:0;height:100%">
      <p>PDF preview unavailable</p>
    </body></html>`,
    { status: 200, headers: { 'Content-Type': 'text/html;charset=utf-8' } },
  )
}
