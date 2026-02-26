# Memsearch Commands

## Overview

Memsearch provides a unified command namespace under `/mem` for all memory and queue operations.

## Available Commands

### `/mem queue-status`

Show global bunqueue status across all projects.

**Examples:**
```
/mem queue-status              # Show current status
/mem queue-status --watch      # Watch mode (live updates)
/mem queue-status -w           # Short form
/mem queue-status --state active    # Show only active jobs
/mem queue-status --project myapp   # Filter by project
/mem queue-status -l 20        # Show last 20 jobs
```

**Output:**
- Summary: Waiting, Active, Completed, Failed job counts
- Currently Processing: Jobs being worked on with duration
- Recent Jobs: List with state, project, created time, duration

### `/mem stats`

Show memory statistics.

**Examples:**
```
/mem stats              # General statistics
/mem stats --detailed   # Detailed breakdown
```

### `/mem history`

Show memory creation history.

**Examples:**
```
/mem history            # Recent memory operations
/mem history --last 20  # Last 20 operations
```

### `/mem backfill`

Trigger manual backfill of unprocessed sessions.

**Examples:**
```
/mem backfill           # Backfill current project
/mem backfill --all     # Backfill all projects
```

### `/mem doctor`

Run diagnostics on memsearch setup.

**Examples:**
```
/mem doctor             # Check configuration and health
/mem doctor --fix       # Attempt to fix issues
```

## Installation

The `/mem` command is automatically available when the memsearch plugin is installed and the command definition is in `~/.config/opencode/command/mem.md`.

To install the command definition:
```bash
cp .opencode/command/mem.md ~/.config/opencode/command/
```

## Global Queue Monitoring

The queue status command provides real-time visibility into bunqueue across all projects:

```bash
# Terminal 1: Watch queue in real-time
/mem queue-status --watch

# Shows:
# - Total jobs waiting/active/completed/failed
# - Which projects are currently being processed
# - How long jobs have been running
# - Recent job history with timestamps
```

This is useful for:
- Monitoring backfill progress
- Checking if the worker is processing jobs
- Seeing which projects have pending operations
- Debugging queue issues
