#!/usr/bin/env node

import "source-map-support/register";

import PrettyError from "pretty-error";
import prompts from "prompts";
import passwd from "generate-password";
import { paramCase } from "change-case";
import path from "path";
import util from "util";

import createMindfulProject from "./create-mindful-project";

class PromptCancelledError extends Error {}

type EnvVars = {
  NPM_TOKEN: string;
  VERCEL_TOKEN: string;
  VERCEL_ORG_ID: string;
  GOOGLE_APPLICATION_CREDENTIALS: string;
};

async function getResponses() {
  const answers = await prompts(
    [
      {
        type: "text",
        name: "projectName",
        initial: "MS Web",
        message: "What is the name of the project?",
      },
      {
        type: "text",
        name: "projectHid",
        initial: (_, values) => {
          return paramCase(values.projectName);
        },
        message: "Is this the correct project hid?",
      },
      {
        type: "text",
        name: "domain",
        initial: "mindfulstudio.io",
        message: "What is the domain?",
      },
    ],
    {
      onCancel: () => {
        throw new PromptCancelledError();
      },
    }
  );

  return {
    projectName: answers.projectName as string,
    projectHid: answers.projectHid as string,
    domain: answers.domain as string,
  };
}

function validateEnvVars(env: { [key: string]: any }): env is EnvVars {
  const keys = [
    "NPM_TOKEN",
    "VERCEL_TOKEN",
    "VERCEL_ORG_ID",
    "GOOGLE_APPLICATION_CREDENTIALS",
  ];

  return keys.every((k) => typeof env[k] === "string" && env[k] !== "");
}

async function run() {
  if (!validateEnvVars(process.env)) {
    throw new Error();
  }

  const {
    NPM_TOKEN: npmToken,
    VERCEL_TOKEN: vercelToken,
    VERCEL_ORG_ID: vercelOrgId,
    GOOGLE_APPLICATION_CREDENTIALS: gcloudCredentialsFile,
  } = process.env;

  const { projectName, projectHid, domain } = await getResponses();
  const mongoPassword = passwd.generate();
  const destDir = path.join(process.cwd(), projectHid);

  const result = await createMindfulProject({
    projectName,
    projectHid,
    domain,
    npmToken,
    vercelToken,
    vercelOrgId,
    gcloudCredentialsFile,
    mongoPassword,
    destDir,
  });

  console.log("\n", util.inspect(result, { colors: true }), "\n");
}

run().catch((e) => {
  if (e instanceof PromptCancelledError) {
    process.exit(1);
  }
  console.error(new PrettyError().render(e));
  process.exit(1);
});
