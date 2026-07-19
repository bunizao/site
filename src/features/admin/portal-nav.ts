import {
  ChartColumn,
  Image as ImageIcon,
  KeyRound,
  LayoutDashboard,
  Mail,
  MessageSquare,
  Send,
  Sparkles,
  Users,
  type LucideIcon,
} from 'lucide-react';

export interface PortalNavItem {
  key: PortalNavKey;
  label: string;
  href: string;
  Icon: LucideIcon;
}

export type PortalNavKey =
  | 'overview'
  | 'analytics'
  | 'oauth'
  | 'subscribers'
  | 'broadcasts'
  | 'mascot'
  | 'newsletter'
  | 'svg'
  | 'mood-embed';

export const PORTAL_NAV_ITEMS: readonly PortalNavItem[] = [
  { key: 'overview', label: 'Overview', href: '/dev/portal', Icon: LayoutDashboard },
  { key: 'analytics', label: 'Analytics', href: '/dev/portal/analytics', Icon: ChartColumn },
  { key: 'oauth', label: 'Access Hub', href: '/dev/portal/oauth', Icon: KeyRound },
  { key: 'subscribers', label: 'Subscribers', href: '/dev/portal/subscribers', Icon: Users },
  { key: 'broadcasts', label: 'Broadcasts', href: '/dev/portal/broadcasts', Icon: Send },
  { key: 'mascot', label: 'Mascot', href: '/dev/portal/mascot', Icon: Sparkles },
  { key: 'newsletter', label: 'Newsletter', href: '/dev/portal/newsletter', Icon: Mail },
  { key: 'svg', label: 'SVG gallery', href: '/dev/portal/svg', Icon: ImageIcon },
  { key: 'mood-embed', label: 'Mood embed', href: '/dev/portal/mood-embed', Icon: MessageSquare },
] as const;
