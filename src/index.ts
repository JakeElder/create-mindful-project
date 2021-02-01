#!/usr/bin/env node

import "source-map-support/register";
import prompts from "prompts";
import PrettyError from "pretty-error";
import chalk from "chalk";
import passwd from "generate-password";
import { paramCase } from "change-case";
import path from "path";

import * as steppy from "./steppy";

import localSteps, {
  Context as LocalStepContext,
  Outputs as LocalStepOutputs,
} from "./local-steps";

import remoteSteps, {
  Context as RemoteStepContext,
  Outputs as RemoteStepOutputs,
} from "./remote-steps";

import linkSteps, {
  Context as LinkStepContext,
  Outputs as LinkStepOutputs,
} from "./link-steps";

class PromptCancelledError extends Error {}

type EnvVars = {
  NPM_TOKEN: string;
  VERCEL_TOKEN: string;
  VERCEL_ORG_ID: string;
  GOOGLE_APPLICATION_CREDENTIALS: string;
};

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

  steppy.head("setting up development environment");
  await steppy.run<LocalStepContext, LocalStepOutputs>(localSteps, {
    destDir,
    templateDir,
    projectHid,
    projectName,
  });

  const mongoPassword = passwd.generate();

  steppy.head("setting up stage environment");
  const setupStageOutputs = await steppy.run<
    RemoteStepContext,
    RemoteStepOutputs
  >(
    remoteSteps,
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
      vercelOrgId,
      vercelToken,
      npmToken,
      gcloudCredentialsFile,
    },
    { formatGroup }
  );

  steppy.head("linking stage environment");
  await steppy.run<LinkStepContext, LinkStepOutputs>(linkSteps, {
    projectHid,
    destDir,
    env: {
      name: "Stage",
      shortName: "Stage",
      slug: "stage",
      nodeEnv: "stage",
      constantSuffix: "STAGE",
    },
    vercelToken,
    vercelOrgId,
    cmsDatabaseUri: setupStageOutputs["getting database uri"].uri,
    gcloudProjectId: setupStageOutputs["setting up google cloud"].projectId,
    uiProjectId: setupStageOutputs["creating ui project"].projectId,
    appProjectId: setupStageOutputs["creating app project"].projectId,
    githubRepoUrl: setupStageOutputs["setting up github"].repoUrl,
  });

  steppy.head("setting up production environment");
  const setupProdOutputs = await steppy.run<
    RemoteStepContext,
    RemoteStepOutputs
  >(
    remoteSteps,
    {
      projectName,
      projectHid,
      destDir,
      domain,
      env: {
        name: "Production",
        shortName: "Prod",
        slug: "prod",
        nodeEnv: "production",
        constantSuffix: "PROD",
      },
      mongoPassword,
      vercelOrgId,
      vercelToken,
      npmToken,
      gcloudCredentialsFile,
      githubRepoUrl: setupStageOutputs["setting up github"].repoUrl,
      mongoUserCreated: true,
    },
    { formatGroup }
  );

  steppy.head("linking production environment");
  await steppy.run<LinkStepContext, LinkStepOutputs>(linkSteps, {
    projectHid,
    destDir,
    env: {
      name: "Production",
      shortName: "Prod",
      slug: "prod",
      nodeEnv: "production",
      constantSuffix: "PROD",
    },
    vercelToken,
    vercelOrgId,
    cmsDatabaseUri: setupProdOutputs["getting database uri"].uri,
    gcloudProjectId: setupProdOutputs["setting up google cloud"].projectId,
    uiProjectId: setupProdOutputs["creating ui project"].projectId,
    appProjectId: setupProdOutputs["creating app project"].projectId,
    githubRepoUrl: setupProdOutputs["setting up github"].repoUrl,
    skipGit: true,
  });
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
