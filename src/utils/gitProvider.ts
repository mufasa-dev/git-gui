export type GitProvider = 'github' | 'gitlab' | 'azure' | 'unknown';

export type RemoteRepositoryContext = {
  provider: GitProvider;
  webUrl: string;
  owner?: string;
  name: string;
  organization?: string;
  project?: string;
  repository?: string;
};

function normalizeRemoteUrl(rawUrl: string): string {
  let url = rawUrl.trim();
  if (url.startsWith('git@')) {
    url = url.replace(/^git@/, 'https://').replace(':', '/');
  }

  url = url.replace(/^https:\/\/[^@]+@/, 'https://');
  return url.replace(/\.git$/, '').replace(/\/$/, '');
}

export function getProviderFromUrl(url: string): GitProvider {
  const normalized = normalizeRemoteUrl(url).toLowerCase();
  if (normalized.includes('github.com')) return 'github';
  if (normalized.includes('gitlab.com')) return 'gitlab';
  if (normalized.includes('visualstudio.com') || normalized.includes('dev.azure.com')) return 'azure';
  return 'unknown';
}

export function parseRemoteRepository(rawUrl: string): RemoteRepositoryContext | null {
  const webUrl = normalizeRemoteUrl(rawUrl);
  if (!webUrl) return null;

  const provider = getProviderFromUrl(webUrl);
  let parsed: URL;
  try {
    parsed = new URL(webUrl);
  } catch {
    return null;
  }

  const parts = parsed.pathname.split('/').filter(Boolean);
  if (provider === 'github' && parts.length >= 2) {
    return {
      provider,
      webUrl,
      owner: parts[0],
      name: parts[1],
      repository: parts[1],
    };
  }

  if (provider === 'azure') {
    if (parsed.hostname === 'dev.azure.com' && parts.length >= 4 && parts[2] === '_git') {
      return {
        provider,
        webUrl,
        organization: parts[0],
        project: decodeURIComponent(parts[1]),
        name: decodeURIComponent(parts[3]),
        repository: decodeURIComponent(parts[3]),
      };
    }

    if (parsed.hostname.endsWith('.visualstudio.com') && parts.length >= 3 && parts[1] === '_git') {
      return {
        provider,
        webUrl,
        organization: parsed.hostname.split('.')[0],
        project: decodeURIComponent(parts[0]),
        name: decodeURIComponent(parts[2]),
        repository: decodeURIComponent(parts[2]),
      };
    }
  }

  return { provider, webUrl, name: parts.length > 0 ? parts[parts.length - 1] : '' };
}
