import { backfillAllSessions } from "../lib/queue/backfill";

console.log("Running backfill...");
const result = await backfillAllSessions();
console.log("Backfill result:", result);

console.log("\nChecking queue after backfill...");
import { queue } from "../lib/queue/memory-queue";
const waiting = await queue.getWaitingCount();
console.log(`Waiting jobs: ${waiting}`);
