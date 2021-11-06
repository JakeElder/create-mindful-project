import extend from "extend";

const values = { colors: {} } as const;
const aliases = {} as const;

const theme = extend(true, {}, values, aliases);
type T = typeof theme & { locale: string | undefined };

declare module "@emotion/react" {
  export interface Theme extends T {}
}

export default theme;
