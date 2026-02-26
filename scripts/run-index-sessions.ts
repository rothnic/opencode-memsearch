import path from "path";
import { indexSessions } from "../lib/session-indexer";

async function main() {
	const projectPath = process.cwd();
	const workdir = process.cwd();
	const projectId = "test-project-123";

	console.log(
		`Running indexSessions for projectId=${projectId} workdir=${workdir}`,
	);
	try {
		await indexSessions(projectPath, workdir, { projectId });
		console.log("indexSessions completed");
	} catch (err) {
		console.error("indexSessions threw:", err);
		process.exitCode = 2;
	}
}

main();
