export type GitProvider = 'github' | 'gitlab' | 'azure' | 'unknown';

export function getProviderFromUrl(url: string): GitProvider {
  if (url.includes('github.com')) return 'github';
  if (url.includes('gitlab.com')) return 'gitlab';
  if (url.includes('visualstudio.com') || url.includes('dev.azure.com')) return 'azure';
  return 'unknown';
}