export interface UserProfile {
  id: string;
  email: string;
  full_name: string | null;
  is_vip: boolean;
  created_at: string;
}