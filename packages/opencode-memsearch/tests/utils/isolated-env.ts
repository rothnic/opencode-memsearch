import { $ } from "bun";
import { mkdtemp, rm, writeFile, mkdir } from "node:fs/promises";
import { join } from "node:path";
import { tmpdir } from "node:os";

export interface TestEnv {
  home: string;
  pluginPath: string;
  mockBinDir?: string;
  cleanup: () => Promise<void>;
}

export async function createIsolatedEnv(): Promise<TestEnv> {
  const home = await mkdtemp(join(tmpdir(), "opencode-test-"));
  const projectRoot = join(import.meta.dir, "..", "..");
  const pluginPath = projectRoot;
  
  const opencodeJson = {
    plugin: [
      `file://${pluginPath}/index.ts`
    ],
    agent: {
      "sisyphus": {
        "name": "sisyphus",
        "model": "google/antigravity-gemini-3-flash",
        "mode": "all",
        "description": "Sisyphus Agent",
        "instructions": "You are a test agent.",
        "options": {}
      }
    }
  };
  
  const configDir = join(home, ".config", "opencode");
  await mkdir(configDir, { recursive: true });
  
  await writeFile(join(configDir, "opencode.json"), JSON.stringify(opencodeJson, null, 2));
  
  const worktree = join(home, "worktree");
  await mkdir(worktree);

  return {
    home,
    pluginPath,
    cleanup: async () => {
      await rm(home, { recursive: true, force: true });
    }
  };
}

export function getOpencodeCmd(env: TestEnv) {
  return (args: string[]) => {
    const path = env.mockBinDir ? `${env.mockBinDir}:${process.env.PATH}` : process.env.PATH;
    return $`HOME=${env.home} XDG_CONFIG_HOME=${env.home}/.config XDG_DATA_HOME=${env.home}/.local/share XDG_STATE_HOME=${env.home}/.local/state XDG_CACHE_HOME=${env.home}/.cache OPENCODE_TEST_HOME=${env.home} PATH=${path} opencode ${args}`.cwd(join(env.home, "worktree")).quiet();
  };
}
