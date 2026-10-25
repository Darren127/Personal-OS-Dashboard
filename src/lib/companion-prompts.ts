/** Ready-made requests for the AI Companion (shared by server pages and the chat UI). */
export const QUICK_PROMPTS: Record<string, { label: string; text: string }> = {
  plan: {
    label: "Plan my day",
    text: "Help me plan today. Look at my priorities, what's due and overdue, and my working hours, then suggest a realistic plan. Tell me if I'm trying to fit in too much.",
  },
  next: { label: "What should I do next?", text: "What's the single most useful thing I should do next, and why?" },
  procrastination: {
    label: "Why do I keep postponing things?",
    text: "Look at the tasks I keep rescheduling or leaving overdue. What patterns do you see, and what would you change?",
  },
  overcommitted: {
    label: "Am I overcommitted?",
    text: "Am I taking on more than I can realistically do? Compare my commitments with what I've actually been completing.",
  },
  weekly: {
    label: "Weekly review",
    text: "Let's do my weekly review. Look at the last 7 days: what I planned versus what happened, progress on my goals and projects, patterns worth noticing, and what I should change next week. Be honest. When we're done, offer to save a short summary as my weekly review.",
  },
  monthly: {
    label: "Monthly review",
    text: "Let's do my monthly review. Look at the last 30 days: which goals moved and which stalled, whether my time went to what I say matters, recurring obstacles, and the two or three changes that would help most next month.",
  },
};
