import {
  Ban,
  ChartColumn,
  ChartNoAxesColumn,
  Heart,
  History,
  House,
  Image as ImageIcon,
  Inbox,
  Mail,
  MessageSquare,
  MessagesSquare,
  NotebookPen,
  Send,
  Sparkles,
  Users,
  type LucideIcon,
} from 'lucide-react';

export interface NavItem {
  id: string;
  label: string;
  to: string;
  Icon: LucideIcon;
  /** `g <key>` jumps here. */
  chord?: string;
  /** Extra words the palette matches on. */
  keywords?: string;
  children?: NavItem[];
}

export const NAV: readonly { label: string | null; items: NavItem[] }[] = [
  {
    label: null,
    items: [
      { id: 'home', label: 'Home', to: '/', Icon: House, chord: 'h', keywords: 'overview dashboard' },
      {
        id: 'comments',
        label: 'Comments',
        to: '/comments',
        Icon: MessagesSquare,
        children: [
          { id: 'inbox', label: 'Inbox', to: '/comments', Icon: Inbox, chord: 'c', keywords: 'held queue moderation review' },
          { id: 'reactions', label: 'Reactions', to: '/comments/reactions', Icon: Heart, keywords: 'hearts emoji' },
          { id: 'bans', label: 'Bans', to: '/comments/bans', Icon: Ban, chord: 'b', keywords: 'block spam' },
          { id: 'insights', label: 'Insights', to: '/comments/insights', Icon: ChartNoAxesColumn, keywords: 'stats quality' },
        ],
      },
      { id: 'subscribers', label: 'Subscribers', to: '/subscribers', Icon: Users, chord: 's', keywords: 'readers newsletter email' },
      { id: 'broadcasts', label: 'Broadcasts', to: '/broadcasts', Icon: Send, keywords: 'newsletter send' },
      { id: 'analytics', label: 'Analytics', to: '/analytics', Icon: ChartColumn, chord: 'a', keywords: 'views traffic' },
      { id: 'activity', label: 'Activity', to: '/activity', Icon: History, keywords: 'log audit events' },
    ],
  },
  {
    label: 'Previews',
    items: [
      { id: 'blog', label: 'Blog previews', to: '/blog', Icon: NotebookPen },
      { id: 'mascot', label: 'Mascot', to: '/mascot', Icon: Sparkles },
      { id: 'newsletter', label: 'Email templates', to: '/newsletter', Icon: Mail },
      { id: 'svg', label: 'SVG gallery', to: '/svg', Icon: ImageIcon },
      { id: 'mood-embed', label: 'Mood embed', to: '/mood-embed', Icon: MessageSquare },
    ],
  },
];

/** Every destination once; a parent with children is only its children. */
export function flatNav(): NavItem[] {
  return NAV.flatMap((group) => group.items.flatMap((item) => item.children ?? [item]));
}
