import { ExternalLink, FlaskConical, LogOut, Search } from 'lucide-react';
import { Kbd } from '@/components/coss/kbd';
import {
  Sidebar,
  SidebarContent,
  SidebarFooter,
  SidebarGroup,
  SidebarGroupContent,
  SidebarGroupLabel,
  SidebarHeader,
  SidebarMenu,
  SidebarMenuBadge,
  SidebarMenuButton,
  SidebarMenuItem,
  SidebarMenuSub,
  SidebarMenuSubButton,
  SidebarMenuSubItem,
  SidebarRail,
  useSidebar,
} from '@/components/coss/sidebar';
import { Tooltip, TooltipPopup, TooltipTrigger } from '@/components/coss/tooltip';
import { useCommentCounts } from '../../comments/data';
import { NAV, type NavItem } from '../nav';
import { Link, usePathSelect } from '../router';

export interface PortalUser {
  login: string;
  email?: string | null;
  avatarUrl?: string | null;
}

function isActive(path: string, item: NavItem): boolean {
  if (item.to === '/') return path === '/';
  if (item.to === '/comments') return path === '/comments';
  return path === item.to || path.startsWith(`${item.to}/`);
}

/** The active entry's own path for any path under it: `/subscribers/abc`
    reads as `/subscribers`. Entries do not overlap, so it is the only one
    `isActive` holds for. */
function entryPath(path: string): string {
  for (const group of NAV) {
    for (const item of group.items) {
      for (const entry of [item, ...(item.children ?? [])]) if (isActive(path, entry)) return entry.to;
    }
  }
  return path;
}

function HeldBadge() {
  const counts = useCommentCounts();
  const held = counts.data?.held ?? 0;
  if (held === 0) return null;
  return (
    <SidebarMenuBadge className="bg-warning/16 text-warning-foreground" aria-label={`${held} held`}>
      {held > 99 ? '99+' : held}
    </SidebarMenuBadge>
  );
}

export function AppSidebar({ user, demo, onSearch }: { user: PortalUser | null; demo: boolean; onSearch: () => void }) {
  // The entry only: a screen writing its query string, or opening a row
  // (which changes the path), must not re-render the nav.
  const path = usePathSelect(entryPath);
  const { isMobile, setOpenMobile } = useSidebar();
  const close = () => isMobile && setOpenMobile(false);

  return (
    <Sidebar collapsible="icon">
      <SidebarHeader>
        <SidebarMenu>
          <SidebarMenuItem>
            <SidebarMenuButton size="lg" render={<Link to="/" onClick={close} />} tooltip="Dev Portal">
              <img src="/logo/peek.svg?v=3" alt="" width={22} height={20} className="size-6 shrink-0 object-contain" />
              <span className="flex min-w-0 flex-col leading-tight">
                <span className="font-semibold text-sm text-sidebar-accent-foreground">Dev Portal</span>
                <span className="text-muted-foreground text-xs">buxx.me</span>
              </span>
              {demo && (
                <Tooltip>
                  <TooltipTrigger
                    render={<span className="ms-auto inline-flex items-center gap-1 rounded-sm bg-info/16 px-1.5 py-0.5 text-info-foreground text-xs" />}
                  >
                    <FlaskConical className="size-3" aria-hidden />
                    Demo
                  </TooltipTrigger>
                  <TooltipPopup>No site-api here, so every screen runs on in-memory demo data. Run bun dev:api for real data.</TooltipPopup>
                </Tooltip>
              )}
            </SidebarMenuButton>
          </SidebarMenuItem>
          <SidebarMenuItem>
            <SidebarMenuButton onClick={onSearch} tooltip="Search (⌘K)" className="text-muted-foreground">
              <Search />
              <span>Search or jump to</span>
              <Kbd className="ms-auto">⌘K</Kbd>
            </SidebarMenuButton>
          </SidebarMenuItem>
        </SidebarMenu>
      </SidebarHeader>

      <SidebarContent>
        {NAV.map((group, index) => (
          <SidebarGroup key={group.label ?? index}>
            {group.label && <SidebarGroupLabel>{group.label}</SidebarGroupLabel>}
            <SidebarGroupContent>
              <SidebarMenu>
                {group.items.map((item) => (
                  <SidebarMenuItem key={item.id}>
                    <SidebarMenuButton
                      isActive={!item.children && isActive(path, item)}
                      tooltip={item.label}
                      render={<Link to={item.to} onClick={close} aria-current={!item.children && isActive(path, item) ? 'page' : undefined} />}
                    >
                      <item.Icon />
                      <span>{item.label}</span>
                    </SidebarMenuButton>
                    {item.id === 'comments' && <HeldBadge />}
                    {item.children && (
                      <SidebarMenuSub>
                        {item.children.map((child) => (
                          <SidebarMenuSubItem key={child.id}>
                            <SidebarMenuSubButton
                              isActive={isActive(path, child)}
                              aria-current={isActive(path, child) ? 'page' : undefined}
                              render={<Link to={child.to} onClick={close} />}
                            >
                              <child.Icon />
                              <span>{child.label}</span>
                            </SidebarMenuSubButton>
                          </SidebarMenuSubItem>
                        ))}
                      </SidebarMenuSub>
                    )}
                  </SidebarMenuItem>
                ))}
              </SidebarMenu>
            </SidebarGroupContent>
          </SidebarGroup>
        ))}
      </SidebarContent>

      <SidebarFooter>
        <SidebarMenu>
          <SidebarMenuItem>
            <SidebarMenuButton render={<a href="/" target="_blank" rel="noreferrer" />} tooltip="View site">
              <ExternalLink />
              <span>View site</span>
            </SidebarMenuButton>
          </SidebarMenuItem>
          {user && (
            <SidebarMenuItem>
              {/* Never prefetched: Astro fetches links on hover, and fetching this one signs the owner out. */}
              <SidebarMenuButton size="lg" render={<a href="/cdn-cgi/access/logout?returnTo=https%3A%2F%2Fbuxx.me%2F" data-astro-prefetch="false" />} tooltip="Sign out">
                {user.avatarUrl ? (
                  <img src={user.avatarUrl} alt="" className="size-7 shrink-0 rounded-full" referrerPolicy="no-referrer" />
                ) : (
                  <span className="flex size-7 shrink-0 items-center justify-center rounded-full bg-sidebar-accent font-medium text-xs">
                    {user.login.slice(0, 1).toUpperCase()}
                  </span>
                )}
                <span className="flex min-w-0 flex-col leading-tight">
                  <span className="truncate font-medium text-sm">{user.login}</span>
                  <span className="truncate text-muted-foreground text-xs">Sign out</span>
                </span>
                <LogOut className="ms-auto" />
              </SidebarMenuButton>
            </SidebarMenuItem>
          )}
        </SidebarMenu>
      </SidebarFooter>
      <SidebarRail />
    </Sidebar>
  );
}
