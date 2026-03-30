export interface GravatarAccount {
  id: string;
  url: string;
  shortname: string;
  display: string;
}

export interface GravatarUrl {
  value: string;
  title: string;
}

export interface GravatarProfileEntry {
  id: string;
  hash: string;
  requestHash: string;
  profileUrl: string;
  preferredUsername: string;
  thumbnailUrl: string;
  photos: { value: string; type: string }[];
  name: { formatted: string };
  displayName: string;
  aboutMe?: string;
  currentLocation?: string;
  urls: GravatarUrl[];
  accounts: GravatarAccount[];
  // Adicione outros campos se necessário
}

export interface GravatarProfileResponse {
  entry: GravatarProfileEntry[];
}