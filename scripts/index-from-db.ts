#!/usr/bin/env bun
/**
 * Test script for database-backed session indexing
 */
import { indexSessionsFromDB } from "../src/processing/session-indexer";

const PROJECT_ID = "ad761ea6174e58ed763fc75290c3f403ed51079d";
const WORKDIR = "/Users/nroth/workspace/udd";

async function main() {
	console.log("Indexing all UDD sessions from database...\n");

	await indexSessionsFromDB(WORKDIR, WORKDIR, { projectId: PROJECT_ID });

	console.log("\nDone!");
}

main().catch(console.error);
