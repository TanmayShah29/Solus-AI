import { serve } from "inngest/next";
import { inngest } from "@/inngest/client";
import { extractMemory } from "@/inngest/functions/extract-memory";
import { taskRunner } from "@/inngest/functions/task-runner";
import { reminderJob } from "@/inngest/functions/reminder";
import { morningBrief } from "@/inngest/functions/morning-brief";
import { proactiveMonitor } from "@/inngest/functions/proactive-monitor";
import { goalReview } from "@/inngest/functions/goal-review";
import { healthCheck } from "@/inngest/functions/health-check";
import { qualityScorer } from "@/inngest/functions/quality-scorer";
import { usageSummary } from "@/inngest/functions/usage-summary";
import { syncClaudeMd } from "@/inngest/functions/sync-claude-md";
import { proactiveSuggestions } from "@/inngest/functions/proactive-suggestions";
import { goalNudge } from "@/inngest/functions/goal-nudge";
import { memorySync } from "@/inngest/functions/memory-sync";
import { telegramHandler } from "@/inngest/functions/telegram-handler";

export const { GET, POST, PUT } = serve({
    client: inngest,
    functions: [
        extractMemory,
        taskRunner,
        reminderJob,
        // morningBrief,
        // proactiveMonitor,
        // goalReview,
        // healthCheck,
        // usageSummary,
        syncClaudeMd,
        // proactiveSuggestions,
        // goalNudge,
        memorySync,
        telegramHandler,
    ],
});
