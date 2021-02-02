import type { Config } from "@jest/types";

const config: Config.InitialOptions = {
  verbose: true,
  testMatch: ["**/tests/**/*.[jt]s"],
  transform: {
    "^.+\\.(ts|tsx)$": "ts-jest",
  },
};

export default config;
