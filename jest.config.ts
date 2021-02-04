import type { Config } from "@jest/types";

const config: Config.InitialOptions = {
  testEnvironment: "node",
  testMatch: ["**/tests/**/*.[jt]s"],
  testPathIgnorePatterns: [
    "<rootDir>/node_modules/",
    "<rootDir>/tests/.test.tmp/",
    "<rootDir>/tests/fixtures/",
  ],
  transform: {
    "^.+\\.(ts|tsx)$": "ts-jest",
  },
  globals: {
    Uint8Array: Uint8Array,
  },
};

export default config;
