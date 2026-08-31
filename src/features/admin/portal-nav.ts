import {
  ChartColumn,
  Image as ImageIcon,
  LayoutDashboard,
  Mail,
  MessageSquare,
  MessagesSquare,
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

export interface PortalNavGroup {
  label: string;
  items: readonly PortalNavItem[];
}

export type PortalNavKey =
  | 'overview'
  | 'analytics'
  | 'subscribers'
  | 'comments'
  | 'broadcasts'
  | 'mascot'
  | 'newsletter'
  | 'svg'
  | 'mood-embed';

export const PORTAL_NAV_GROUPS: readonly PortalNavGroup[] = [
  {
    label: 'Manage',
    items: [
      { key: 'overview', label: 'Overview', href: '/dev/portal', Icon: LayoutDashboard },
      { key: 'subscribers', label: 'Subscribers', href: '/dev/portal/subscribers', Icon: Users },
      { key: 'comments', label: 'Comments', href: '/dev/portal/comments', Icon: MessagesSquare },
      { key: 'broadcasts', label: 'Broadcasts', href: '/dev/portal/broadcasts', Icon: Send },
      { key: 'analytics', label: 'Analytics', href: '/dev/portal/analytics', Icon: ChartColumn },
    ],
  },
  {
    label: 'Previews',
    items: [
      { key: 'mascot', label: 'Mascot', href: '/dev/portal/mascot', Icon: Sparkles },
      { key: 'newsletter', label: 'Email templates', href: '/dev/portal/newsletter', Icon: Mail },
      { key: 'svg', label: 'SVG gallery', href: '/dev/portal/svg', Icon: ImageIcon },
      { key: 'mood-embed', label: 'Mood embed', href: '/dev/portal/mood-embed', Icon: MessageSquare },
    ],
  },
] as const satisfies readonly PortalNavGroup[];
