export const queueState = {
  processingProjects: new Set<string>(),
  stats: {
    completed: 0,
    failed: 0,
    deferred: 0,
  },
  lastJobTimestamps: new Map<string, number>(),
};

export function isProjectProcessing(projectId: string): boolean {
  return queueState.processingProjects.has(projectId);
}

export function markProjectProcessing(projectId: string): void {
  queueState.processingProjects.add(projectId);
}

export function unmarkProjectProcessing(projectId: string): void {
  queueState.processingProjects.delete(projectId);
}

export function incrementCompleted(): void {
  queueState.stats.completed++;
}

export function incrementFailed(): void {
  queueState.stats.failed++;
}

export function incrementDeferred(): void {
  queueState.stats.deferred++;
}

export function getLastJobTime(projectId: string): number | undefined {
  return queueState.lastJobTimestamps.get(projectId);
}

export function setLastJobTime(projectId: string, timestamp: number = Date.now()): void {
  queueState.lastJobTimestamps.set(projectId, timestamp);
}
