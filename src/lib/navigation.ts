import {
  BotMessageSquare,
  CalendarCheck,
  FolderKanban,
  ListTodo,
  NotebookPen,
  Settings,
  Target,
  type LucideIcon,
} from "lucide-react";

export type NavItem = {
  href: string;
  label: string;
  icon: LucideIcon;
};

/** Single source of truth for the app's main navigation. */
export const NAV_ITEMS: NavItem[] = [
  { href: "/", label: "My Day", icon: CalendarCheck },
  { href: "/tasks", label: "Tasks", icon: ListTodo },
  { href: "/goals", label: "Life Goals", icon: Target },
  { href: "/projects", label: "Projects", icon: FolderKanban },
  { href: "/companion", label: "AI Companion", icon: BotMessageSquare },
  { href: "/reviews", label: "Reviews", icon: NotebookPen },
  { href: "/settings", label: "Settings", icon: Settings },
];

export function isActive(pathname: string, href: string) {
  return href === "/" ? pathname === "/" : pathname.startsWith(href);
}
