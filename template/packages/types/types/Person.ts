import { object, string, Infer } from "superstruct";

export const PersonStruct = object({
  name: string(),
  username: string(),
});

export type Person = Infer<typeof PersonStruct>;
