import { watch, type FSWatcher, readdirSync, existsSync } from "node:fs";
import { readFile } from "node:fs/promises";
import { join } from "node:path";
import { createHash } from "node:crypto";

export interface ConfigChangeEvent {
  type: "created" | "modified" | "deleted";
  memoryType: string;
  configPath: string;
  previousHash?: string;
  currentHash?: string;
}

export interface ConfigMonitorOptions {
  memoryDir: string;
  onChange: (event: ConfigChangeEvent) => void | Promise<void>;
  pollIntervalMs?: number;
}

interface ConfigState {
  hash: string;
  lastModified: number;
}

export class MemoryConfigMonitor {
  private memoryDir: string;
  private onChange: (event: ConfigChangeEvent) => void | Promise<void>;
  private pollIntervalMs: number;
  private configStates: Map<string, ConfigState> = new Map();
  private watcher: FSWatcher | null = null;
  private isRunning = false;
  private pollTimer: NodeJS.Timeout | null = null;

  constructor(options: ConfigMonitorOptions) {
    this.memoryDir = options.memoryDir;
    this.onChange = options.onChange;
    this.pollIntervalMs = options.pollIntervalMs || 5000;
  }

  private async hashFile(filepath: string): Promise<string> {
    const content = await readFile(filepath, "utf8");
    return createHash("sha256").update(content).digest("hex").slice(0, 16);
  }

  private async scanConfigs(): Promise<Map<string, ConfigState>> {
    const states = new Map<string, ConfigState>();

    if (!existsSync(this.memoryDir)) {
      return states;
    }

    try {
      const entries = readdirSync(this.memoryDir, { withFileTypes: true });

      for (const entry of entries) {
        if (!entry.isDirectory()) continue;

        const configPath = join(this.memoryDir, entry.name, "config.yaml");
        if (!existsSync(configPath)) continue;

        try {
          const hash = await this.hashFile(configPath);
          const stats = await import("node:fs/promises").then((fs) =>
            fs.stat(configPath)
          );
          states.set(entry.name, {
            hash,
            lastModified: stats.mtimeMs,
          });
        } catch (err) {
          console.warn(`[ConfigMonitor] Failed to read ${configPath}:`, err);
        }
      }
    } catch (err) {
      console.warn(`[ConfigMonitor] Failed to scan ${this.memoryDir}:`, err);
    }

    return states;
  }

  async initialize(): Promise<void> {
    console.log("[ConfigMonitor] Initializing config state...");
    this.configStates = await this.scanConfigs();
    console.log(
      `[ConfigMonitor] Tracked ${this.configStates.size} memory type configs`
    );
    for (const [name, state] of this.configStates) {
      console.log(`  - ${name}: ${state.hash}`);
    }
  }

  private async checkForChanges(): Promise<void> {
    const currentStates = await this.scanConfigs();

    // Check for new or modified configs
    for (const [memoryType, currentState] of currentStates) {
      const previousState = this.configStates.get(memoryType);

      if (!previousState) {
        // New memory type
        console.log(
          `[ConfigMonitor] New memory type detected: ${memoryType}`
        );
        await this.onChange({
          type: "created",
          memoryType,
          configPath: join(this.memoryDir, memoryType, "config.yaml"),
          currentHash: currentState.hash,
        });
      } else if (previousState.hash !== currentState.hash) {
        // Modified config
        console.log(
          `[ConfigMonitor] Config changed for ${memoryType}: ${previousState.hash} -> ${currentState.hash}`
        );
        await this.onChange({
          type: "modified",
          memoryType,
          configPath: join(this.memoryDir, memoryType, "config.yaml"),
          previousHash: previousState.hash,
          currentHash: currentState.hash,
        });
      }
    }

    // Check for deleted configs
    for (const [memoryType, previousState] of this.configStates) {
      if (!currentStates.has(memoryType)) {
        console.log(
          `[ConfigMonitor] Memory type deleted: ${memoryType}`
        );
        await this.onChange({
          type: "deleted",
          memoryType,
          configPath: join(this.memoryDir, memoryType, "config.yaml"),
          previousHash: previousState.hash,
        });
      }
    }

    this.configStates = currentStates;
  }

  async start(): Promise<void> {
    if (this.isRunning) return;

    this.isRunning = true;
    console.log("[ConfigMonitor] Starting file watcher...");

    // Use polling for reliability across platforms
    this.pollTimer = setInterval(() => {
      this.checkForChanges().catch((err) => {
        console.error("[ConfigMonitor] Error checking for changes:", err);
      });
    }, this.pollIntervalMs);

    // Also use native fs.watch for immediate feedback
    try {
      this.watcher = watch(
        this.memoryDir,
        { recursive: true },
        (eventType, filename) => {
          if (filename?.endsWith("config.yaml")) {
            // Debounce - let polling handle the actual check
            console.log(
              `[ConfigMonitor] File event detected: ${filename} (${eventType})`
            );
          }
        }
      );
    } catch (err) {
      console.warn("[ConfigMonitor] Native watcher failed, using polling only");
    }

    console.log(
      `[ConfigMonitor] Watching ${this.memoryDir} (poll: ${this.pollIntervalMs}ms)`
    );
  }

  stop(): void {
    this.isRunning = false;
    if (this.pollTimer) {
      clearInterval(this.pollTimer);
      this.pollTimer = null;
    }
    if (this.watcher) {
      this.watcher.close();
      this.watcher = null;
    }
    console.log("[ConfigMonitor] Stopped");
  }

  getTrackedConfigs(): Map<string, ConfigState> {
    return new Map(this.configStates);
  }
}

export function createConfigMonitor(
  options: ConfigMonitorOptions
): MemoryConfigMonitor {
  return new MemoryConfigMonitor(options);
}
