import { SubNav } from "@/components/sub-nav";

export function CompanionTabs({ counts }: { counts?: { actions: number; memories: number } }) {
  return (
    <SubNav
      label="AI Companion sections"
      items={[
        { href: "/companion", label: "Chat" },
        { href: "/companion/memory", label: "Memory", count: counts?.memories },
        { href: "/companion/actions", label: "Action log", count: counts?.actions },
      ]}
    />
  );
}
