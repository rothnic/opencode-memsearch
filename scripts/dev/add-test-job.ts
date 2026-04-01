import { signalSessionActivity } from "./lib/memory-queue";

await signalSessionActivity(
  "session-created",
  "ses_365b95080ffeKGFkQC650LG1px",
  "opencode-memsearch",
  "/Users/nroth/workspace/opencode-memsearch",
  {}
);
console.log("Test job added");
