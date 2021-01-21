import { object, string, Infer } from "superstruct";

export const ProjectStruct = object({
  name: string(),
});

export type Project = Infer<typeof ProjectStruct>;
