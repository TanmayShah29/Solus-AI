import { serve } from "inngest/next";
import { inngest } from "@/inngest/client";
import { extractMemory } from "@/inngest/functions/extract-memory";
import { taskRunner } from "@/inngest/functions/task-runner";

export const { GET, POST, PUT } = serve({
    client: inngest,
    functions: [extractMemory, taskRunner],
});
