import { z } from "zod";

export const okfFrontMatterSchema = z.object({
  id: z.string(),
  title: z.string(),
  type: z.string(),
  status: z.string(),
  tags: z.array(z.string()),
  sources: z.array(z.string()),
  relationships: z.array(
    z.object({
      type: z.string(),
      target: z.string()
    })
  )
});

export type OkfFrontMatter = z.infer<typeof okfFrontMatterSchema>;

