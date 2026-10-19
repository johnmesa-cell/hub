export type Visibility = 'public' | 'private';

export interface Project {
  id: string;
  name: string;
  slug: string;
  url: string;
  description: string | null;
  icon: string | null;
  active: boolean;
  sort_order: number;
  visibility: Visibility;
}
