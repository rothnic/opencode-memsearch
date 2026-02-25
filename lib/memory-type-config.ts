/**
 * @file memory-type-config.ts
 * @description Zod schema for memory/<type>/config.yaml used by the
 * configurable extraction pipeline (task 2). This is intentionally narrow:
 * defines the per-memory-type fields and validations required by the plan.
 */

import { z } from "zod";

// Readable regexes with tests below
export const ModelNameRegex = /^([a-zA-Z0-9_-]+)\/([a-zA-Z0-9._-]+)$/; // provider/model
export const CollectionNameRegex = /^[a-zA-Z][a-zA-Z0-9_\-]{2,63}$/; // start with letter, 3-64 chars

// Prompt length bounds
export const MIN_PROMPT_LENGTH = 10;
export const MAX_PROMPT_LENGTH = 2000;

/**
 * Output configuration for memory type (minimal)
 */
export const MemoryConfigOutputSchema = z.object({
  path: z.string().optional().default("memory"),
  filenamePattern: z.string().optional().default("{date}_{session_id}.md"),
});

export type MemoryConfigOutput = z.infer<typeof MemoryConfigOutputSchema>;

/**
 * Main per-memory-type config schema for memory/<type>/config.yaml
 * Fields required by the plan: name, description, collection, extractionPrompt,
 * model, enabled, tags, frequency, output
 */
export const MemoryTypeConfigSchema = z.object({
  name: z.string().min(1),
  description: z.string().optional(),
  collection: z
    .string()
    .refine((s) => CollectionNameRegex.test(s), {
      message: "collection must match /^[a-zA-Z][a-zA-Z0-9_\-]{2,63}$/",
    }),
  extractionPrompt: z
    .string()
    .min(MIN_PROMPT_LENGTH, { message: `extractionPrompt must be at least ${MIN_PROMPT_LENGTH} chars` })
    .max(MAX_PROMPT_LENGTH, { message: `extractionPrompt must be at most ${MAX_PROMPT_LENGTH} chars` }),
  model: z
    .string()
    .optional()
    .refine((m) => (m === undefined ? true : ModelNameRegex.test(m)), {
      message: "model must be in provider/model format (e.g. openai/gpt-4)",
    }),
  enabled: z.boolean().optional().default(true),
  tags: z.array(z.string()).optional().default([]),
  frequency: z
    .object({
      mode: z.enum(["manual", "per-session", "interval-minutes", "on-demand"]).default("manual"),
      intervalMinutes: z.number().int().positive().optional().default(60),
      onCompact: z.boolean().optional().default(false),
    })
    .optional()
    .default({ mode: "manual", intervalMinutes: 60, onCompact: false }),
  output: MemoryConfigOutputSchema.optional().default({ path: "memory", filenamePattern: "{date}_{session_id}.md" }),
});

export type MemoryTypeConfig = z.infer<typeof MemoryTypeConfigSchema>;

export default MemoryTypeConfigSchema;
