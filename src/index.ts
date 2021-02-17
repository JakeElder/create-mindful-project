#!/usr/bin/env node

import "source-map-support/register";

import PrettyError from "pretty-error";
import prompts from "prompts";
import passwd from "generate-password";
import { paramCase } from "change-case";
import path from "path";
import util from "util";
import yargs from "yargs/yargs";

import createMindfulProject from "./create-mindful-project";

class PromptCancelledError extends Error {}
class MissingEnvVarsError extends Error {}

type EnvVars = {
  NPM_TOKEN: string;
  VERCEL_TOKEN: string;
  VERCEL_ORG_ID: string;
  GOOGLE_APPLICATION_CREDENTIALS: string;
  MONGO_PROJECT_ID_STAGE: string;
  MONGO_USER_ID_STAGE: string;
  MONGO_USER_TOKEN_STAGE: string;
  MONGO_PROJECT_ID_PROD: string;
  MONGO_USER_ID_PROD: string;
  MONGO_USER_TOKEN_PROD: string;
};

type Questions = prompts.PromptObject<
  "projectName" | "projectHid" | "domain"
>[];

function getResponses() {
  const questions: Questions = [
    {
      type: "text",
      name: "projectName",
      initial: "MS Web",
      message: "What is the name of the project?",
    },
    {
      type: "text",
      name: "projectHid",
      initial: (_, values) => paramCase(values.projectName),
      message: "Is this the correct project hid?",
    },
    {
      type: "text",
      name: "domain",
      initial: "mindfulstudio.io",
      message: "What is the domain?",
    },
  ];

  return prompts(questions, {
    onCancel: () => {
      throw new PromptCancelledError();
    },
  });
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

function getEnvVars(env: { [key: string]: any }) {
  if (!validateEnvVars(env)) {
    throw new MissingEnvVarsError();
  }

  return {
    npmToken: env.NPM_TOKEN,
    vercelToken: env.VERCEL_TOKEN,
    vercelOrgId: env.VERCEL_ORG_ID,
    gcloudCredentialsFile: env.GOOGLE_APPLICATION_CREDENTIALS,
    mongoProjectIdStage: env.MONGO_PROJECT_ID_STAGE,
    mongoUserIdStage: env.MONGO_USER_ID_STAGE,
    mongoUserTokenStage: env.MONGO_USER_TOKEN_STAGE,
    mongoProjectIdProd: env.MONGO_PROJECT_ID_PROD,
    mongoUserIdProd: env.MONGO_USER_ID_PROD,
    mongoUserTokenProd: env.MONGO_USER_TOKEN_PROD,
  };
}

async function run() {
  const { argv } = yargs(process.argv).options({
    googleHid: { type: "string" },
  });

  const {
    npmToken,
    vercelToken,
    vercelOrgId,
    gcloudCredentialsFile,
    mongoProjectIdStage,
    mongoUserIdStage,
    mongoUserTokenStage,
    mongoProjectIdProd,
    mongoUserIdProd,
    mongoUserTokenProd,
  } = getEnvVars(process.env);

  const { projectName, projectHid, domain } = await getResponses();
  const mongoPassword = passwd.generate();
  const destDir = path.join(process.cwd(), projectHid);

  const result = await createMindfulProject({
    destDir,
    npmToken,
    vercelToken,
    vercelOrgId,
    gcloudCredentialsFile,
    googleHid: argv.googleHid,
    projectName,
    projectHid,
    domain,
    mongoProjectIdStage,
    mongoUserIdStage,
    mongoUserTokenStage,
    mongoProjectIdProd,
    mongoUserIdProd,
    mongoUserTokenProd,
    mongoPassword,
  });

  console.log("\n", util.inspect(result, { colors: true }), "\n");
}

run().catch((e) => {
  if (e instanceof PromptCancelledError) {
    process.exit(1);
  }
  console.log(e);
  console.error(new PrettyError().render(e));
  process.exit(1);
});
