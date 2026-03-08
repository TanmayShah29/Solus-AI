import { inngest } from '@/inngest/client'
import { createClient } from '@/lib/supabase/server'
import { generateText } from 'ai'
import { groq, REASONING_MODEL } from '@/lib/groq/client'

export const taskRunner = inngest.createFunction(
    { id: "task-runner" },
    { event: "solus/task.created" },
    async ({ event, step }) => {
        const { taskId, goal } = event.data;

        // Step 1 — "load-task": Fetch the task from Supabase by event.data.taskId. Update its status to "running".
        await step.run("load-task", async () => {
            const supabase = await createClient();
            const { error } = await supabase
                .from('tasks')
                .update({ status: 'running' })
                .eq('id', taskId);

            if (error) throw new Error(`Failed to load task: ${error.message}`);
        });

        // Step 2 — "plan-steps": Call Groq with REASONING_MODEL and generateText to break the goal into steps.
        const plannedSteps = await step.run("plan-steps", async () => {
            const { text } = await generateText({
                model: groq(REASONING_MODEL),
                prompt: `You are a task planning assistant. Break this goal into 3-5 concrete, executable steps.
Return ONLY a JSON array of step objects, nothing else.
Format: [{"step": 1, "action": "description", "requires_approval": true/false}]
Set requires_approval to true for any step that: sends messages, modifies files, makes purchases, or has irreversible consequences.

Goal: ${goal}`
            });

            // Parse text as JSON array
            const jsonMatch = text.match(/\[[\s\S]*\]/);
            const steps = JSON.parse(jsonMatch ? jsonMatch[0] : text);

            const supabase = await createClient();
            const { error } = await supabase
                .from('tasks')
                .update({ steps })
                .eq('id', taskId);

            if (error) throw new Error(`Failed to save planned steps: ${error.message}`);

            return steps as { step: number; action: string; requires_approval: boolean }[];
        });

        // Step 3 — "execute-steps": Loop through each step.
        for (const s of plannedSteps) {
            if (s.requires_approval) {
                // update task status to "paused"
                await step.run("pause-for-approval", async () => {
                    const supabase = await createClient();
                    await supabase
                        .from('tasks')
                        .update({ status: 'paused' })
                        .eq('id', taskId);
                });

                const approval = await step.waitForEvent("wait-for-approval", {
                    event: "solus/task.approved",
                    timeout: "24h",
                    if: `event.data.taskId == '${taskId}'`
                });

                if (!approval || !approval.data.approved) {
                    await step.run("mark-failed", async () => {
                        const supabase = await createClient();
                        await supabase
                            .from('tasks')
                            .update({
                                status: 'failed',
                                result: { reason: "rejected by user or timed out" }
                            })
                            .eq('id', taskId);
                    });
                    return;
                }
            }

            // If approved or no approval needed: update current_step in Supabase, update status back to "running"
            await step.run("update-current-step", async () => {
                const supabase = await createClient();
                await supabase
                    .from('tasks')
                    .update({
                        current_step: s.step,
                        status: 'running'
                    })
                    .eq('id', taskId);
            });

            // placeholder for actual tool execution path in Phase 4
        }

        // Step 4 — "complete-task": Update task status to "completed", set completed_at to now, store a summary result.
        await step.run("complete-task", async () => {
            const supabase = await createClient();
            await supabase
                .from('tasks')
                .update({
                    status: 'completed',
                    completed_at: new Date().toISOString(),
                    result: { summary: `Successfully completed all ${plannedSteps.length} steps.` }
                })
                .eq('id', taskId);
        });
    }
);
