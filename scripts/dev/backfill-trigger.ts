import { backfillAllSessions } from "./lib/backfill";
async function run() {
  console.log("Starting backfill...");
  const result = await backfillAllSessions();
  console.log("Backfill result:", result);
}
run();
