import Link from "next/link";
import { Sparkles } from "lucide-react";

import { PageHeader } from "@/components/page-header";
import { SubNav } from "@/components/sub-nav";
import { Button } from "@/components/ui/button";

export default function ReviewsLayout({ children }: LayoutProps<"/reviews">) {
  return (
    <>
      <PageHeader
        title="Reviews"
        description="What actually happened, the patterns in it, and what to change."
        actions={
          <div className="flex flex-wrap gap-2">
            <Button asChild variant="outline">
              <Link href="/companion?prompt=weekly"><Sparkles /> Weekly review with AI</Link>
            </Button>
            <Button asChild variant="outline">
              <Link href="/companion?prompt=monthly"><Sparkles /> Monthly review with AI</Link>
            </Button>
          </div>
        }
      />
      <div className="mb-6">
        <SubNav
          label="Review sections"
          items={[
            { href: "/reviews", label: "Daily" },
            { href: "/reviews/weekly", label: "Weekly" },
            { href: "/reviews/patterns", label: "Patterns" },
          ]}
        />
      </div>
      {children}
    </>
  );
}
