import { AlertTriangle, CalendarClock, ListChecks, Star } from "lucide-react";

import { ComingSoon } from "@/components/coming-soon";
import { TodayGreeting } from "@/components/today-greeting";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";

const SECTIONS = [
  {
    icon: Star,
    title: "Top three priorities",
    description: "The three things that matter most today.",
  },
  {
    icon: ListChecks,
    title: "Due today",
    description: "Tasks with today's due date, with quick completion controls.",
  },
  {
    icon: AlertTriangle,
    title: "Overdue",
    description: "Anything past its due date that still needs a decision.",
  },
  {
    icon: CalendarClock,
    title: "Schedule",
    description: "Time blocks for today, linked to your real tasks.",
  },
];

export default function MyDayPage() {
  return (
    <div className="space-y-8">
      <TodayGreeting />

      <div className="grid gap-4 md:grid-cols-2">
        {SECTIONS.map(({ icon, title, description }) => (
          <Card key={title}>
            <CardHeader>
              <CardTitle>{title}</CardTitle>
            </CardHeader>
            <CardContent>
              <ComingSoon
                icon={icon}
                title="Not connected yet"
                description={description}
                phase={2}
              />
            </CardContent>
          </Card>
        ))}
      </div>
    </div>
  );
}
