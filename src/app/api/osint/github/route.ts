import { NextResponse } from 'next/server';

export const maxDuration = 20;

/** GitHub profile recon via the public GitHub API — keyless tier. */
export async function GET(req: Request) {
  const user = (new URL(req.url).searchParams.get('user') || '').trim().replace(/^@/, '');
  if (!/^[a-zA-Z0-9-]{1,39}$/.test(user)) {
    return NextResponse.json({ error: 'A valid GitHub username is required' }, { status: 400 });
  }
  const headers = { Accept: 'application/vnd.github+json', 'User-Agent': 'BADR-LIVE-EARTH' };
  try {
    const [profileRes, reposRes] = await Promise.all([
      fetch(`https://api.github.com/users/${encodeURIComponent(user)}`, { headers, signal: AbortSignal.timeout(10000) }),
      fetch(`https://api.github.com/users/${encodeURIComponent(user)}/repos?sort=updated&per_page=6`, { headers, signal: AbortSignal.timeout(10000) }),
    ]);
    if (profileRes.status === 404) return NextResponse.json({ error: 'GitHub user not found' }, { status: 404 });
    if (!profileRes.ok) return NextResponse.json({ error: `GitHub returned ${profileRes.status}` }, { status: 502 });
    const p = await profileRes.json();
    const repos = reposRes.ok ? await reposRes.json() : [];
    return NextResponse.json({
      username: p.login,
      name: p.name,
      avatar_url: p.avatar_url,
      followers: p.followers,
      following: p.following,
      public_repos: p.public_repos,
      company: p.company,
      location: p.location,
      email: p.email,
      twitter: p.twitter_username,
      blog: p.blog,
      bio: p.bio,
      created_at: p.created_at,
      recent_repos: (Array.isArray(repos) ? repos : []).map((r: any) => ({ name: r.name, language: r.language, stars: r.stargazers_count })),
      timestamp: new Date().toISOString(),
    }, { headers: { 'Cache-Control': 'public, s-maxage=600, stale-while-revalidate=1200' } });
  } catch {
    return NextResponse.json({ error: 'GitHub lookup failed' }, { status: 502 });
  }
}
