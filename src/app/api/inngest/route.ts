import { serve } from "inngest/next";
import { inngest } from "@/inngest/client";
import { extractMemory } from "@/inngest/functions/extract-memory";
import { taskRunner } from "@/inngest/functions/task-runner";
import { reminderJob } from "@/inngest/functions/reminder";
import { morningBrief } from "@/inngest/functions/morning-brief";
import { proactiveSuggestions } from "@/inngest/functions/proactive-suggestions";
import { goalNudge } from "@/inngest/functions/goal-nudge";

export const { GET, POST, PUT } = serve({
    client: inngest,
    functions: [
        extractMemory,
        taskRunner,
        reminderJob,
        morningBrief,
        proactiveSuggestions,
        goalNudge,
    ],
});
