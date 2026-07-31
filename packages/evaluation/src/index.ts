import { z } from "zod";

export const evaluationCaseSchema = z.object({
  query: z.string().min(1),
  expectedConcepts: z.array(z.string()).default([]),
  expectedSources: z.array(z.string()).default([]),
  forbiddenConcepts: z.array(z.string()).default([]),
  notes: z.string().optional()
});

export type EvaluationCase = z.infer<typeof evaluationCaseSchema>;

