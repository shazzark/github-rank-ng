export interface UserSearchResult {
  login: string;
  id: number;
  avatar_url: string;
  html_url: string;
  type: 'User' | 'Organization';
  score?: number;
  rank?: number;
}

export interface UserProfile extends UserSearchResult {
  name: string | null;
  company: string | null;
  blog: string;
  location: string | null;
  email: string | null;
  bio: string | null;
  public_repos: number;
  public_gists: number;
  followers: number;
  following: number;
  created_at: string;
  updated_at: string;
  twitter_username?: string | null;
}

export type RankedUser = UserProfile & { rank: number };
