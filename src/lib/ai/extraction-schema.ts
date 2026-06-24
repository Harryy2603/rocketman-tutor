// src/lib/ai/extraction-schema.ts
import { z } from 'zod';

export const memoryExtractionSchema = z.object({
  concepts: z.array(z.object({
    concept_name: z.string().describe("The standard educational concept (e.g., 'ATP Production', 'Mitosis')"),
    mastery_score: z.number().min(0).max(100).describe("Estimated mastery from 0-100 based on this chat"),
    status: z.enum(['weak', 'proficient', 'mastered']),
    evidence: z.string().describe("Specific quote or behavior showing WHY they have this mastery level"),
    score_delta: z.number().describe("How much their score changed in this session (e.g., +5, -10)")
  }))
});