import { signalSessionActivity } from "../lib/queue/memory-queue";
async function add() {
  await signalSessionActivity(
    "session-created",
    "ses_365b95080ffeKGFkQC650LG1px",
    "opencode-memsearch", 
    "/Users/nroth/workspace/opencode-memsearch",
    {}
  );
  console.log("Job added");
}
add();
