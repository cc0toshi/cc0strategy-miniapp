import { NextResponse } from 'next/server';

const INDEXER_API_URL = 'https://indexer-production-812c.up.railway.app';

const sanitizeUrl = (url: string | null | undefined): string | null => {
  if (!url || typeof url !== 'string') return null;
  const trimmed = url.trim();
  if (!trimmed) return null;
  if (!trimmed.startsWith('http://') && !trimmed.startsWith('https://')) return null;
  try { new URL(trimmed); return trimmed; } catch { return null; }
};

export async function POST(request: Request) {
  try {
    const body = await request.json();
    
    const tokenData = {
      ...body,
      chain: 'base',
      website_url: sanitizeUrl(body.website_url),
      twitter_url: sanitizeUrl(body.twitter_url),
      telegram_url: sanitizeUrl(body.telegram_url),
      discord_url: sanitizeUrl(body.discord_url),
    };

    const response = await fetch(`${INDEXER_API_URL}/tokens`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(tokenData),
    });

    if (!response.ok) {
      const error = await response.text();
      return NextResponse.json({ error }, { status: response.status });
    }

    const data = await response.json();
    return NextResponse.json(data);
  } catch (error: any) {
    console.error('Error registering token:', error);
    return NextResponse.json({ error: error.message }, { status: 500 });
  }
}
