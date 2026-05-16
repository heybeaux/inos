import { NextResponse } from 'next/server';

// Placeholder API route — will proxy to @heybeaux/inos-api once deployed
export async function GET() {
  return NextResponse.json({
    status: 'ok',
    message: 'Inos web API proxy — connect to apps/api for full functionality',
  });
}
