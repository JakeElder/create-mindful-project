#!/usr/bin/env node

import "source-map-support/register";
import prompts from "prompts";
import PrettyError from "pretty-error";
import chalk from "chalk";
import passwd from "generate-password";
import { paramCase } from "change-case";
import path from "path";

import * as steppy from "./steppy";

import * as SetupLocalEnv from "./jobs/setup-local-env";
import * as SetupGithub from "./jobs/setup-github";
import * as SetupRemoteEnv from "./jobs/setup-remote-env";

class PromptCancelledError extends Error {}

type EnvVars = {
  NPM_TOKEN: string;
  VERCEL_TOKEN: string;
  VERCEL_ORG_ID: string;
  GOOGLE_APPLICATION_CREDENTIALS: string;
};

export type Caveat =
  | "GITHUB_REPO_EXISTS"
  | "GCLOUD_PROJECT_EXISTS"
  | "ATLAS_USER_EXISTS"
  | "VERCEL_PROJECT_EXISTS";

export type EnvDescriptor = {
  name: string;
  shortName: string;
  slug: string;
  nodeEnv: string;
  constantSuffix: string;
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

function formatGroup(group: string) {
  if (group === "vercel") {
    return chalk.magenta(`[${group}]`);
  }
  if (group === "github") {
    return chalk.blue(`[${group}]`);
  }
  if (group === "google") {
    return chalk.green(`[${group}]`);
  }
  if (group === "mongo") {
    return chalk.yellow(`[${group}]`);
  }
  if (group === "local") {
    return chalk.grey(`[${group}]`);
  }
  return `[${group}]`;
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

  const templateDir = path.join(__dirname, "..", "template");
  const destDir = path.join(process.cwd(), projectHid);

  const mongoPassword = passwd.generate();

  steppy.head("setting up dev environment");
  await steppy.run<SetupLocalEnv.Context, SetupLocalEnv.Outputs, Caveat>(
    SetupLocalEnv.steps,
    {
      projectHid,
      destDir,
      templateDir,
      projectName,
    },
    { formatGroup }
  );

  steppy.head("setting up github");
  await steppy.run<SetupGithub.Context, SetupGithub.Outputs, Caveat>(
    SetupGithub.steps,
    {
      destDir,
      projectHid,
      vercelOrgId,
      vercelToken,
      npmToken,
      gcloudCredentialsFile,
    },
    {
      formatGroup,
    }
  );

  steppy.head("setting up stage environment");
  await steppy.run<SetupRemoteEnv.Context, SetupRemoteEnv.Outputs, Caveat>(
    SetupRemoteEnv.steps,
    {
      projectName,
      projectHid,
      destDir,
      domain: `stage.${domain}`,
      env: {
        name: "Stage",
        shortName: "Stage",
        slug: "stage",
        nodeEnv: "stage",
        constantSuffix: "STAGE",
      },
      mongoPassword,
      vercelToken,
      vercelOrgId,
    },
    { formatGroup }
  );

  steppy.head("setting up production environment");
  await steppy.run<SetupRemoteEnv.Context, SetupRemoteEnv.Outputs, Caveat>(
    SetupRemoteEnv.steps,
    {
      projectName,
      projectHid,
      destDir,
      domain: `${domain}`,
      env: {
        name: "Production",
        shortName: "Prod",
        slug: "prod",
        nodeEnv: "production",
        constantSuffix: "PROD",
      },
      mongoPassword,
      vercelToken,
      vercelOrgId,
    },
    { formatGroup }
  );

  console.log();
  console.log(steppy.caveats());
}

run().catch((e) => {
  if (e instanceof PromptCancelledError) {
    process.exit(1);
  }
  const pe = new PrettyError();
  console.log(require("util").inspect(e, false, null, true));
  console.log(pe.render(e));
  process.exit(1);
});
