#!/usr/bin/env node

import "source-map-support/register";
import prompts from "prompts";
import PrettyError from "pretty-error";
import execa from "execa";
import chalk from "chalk";
import passwd from "generate-password";
import { paramCase } from "change-case";
import path from "path";

import * as steppy from "./steppy";

import localSteps, { Context as LocalStepContext } from "./local-steps";
import remoteSteps, {
  Context as RemoteStepContext,
  Outputs as RemoteStepOutputs,
} from "./remote-steps";

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
        initial: "Mindful Studio Web",
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

async function initialiseGit({
  destDir,
  originUrl,
}: {
  destDir: string;
  originUrl: string;
}) {
  await execa("git", ["init"], {
    cwd: destDir,
  });
  await execa("git", ["add", "--all"], {
    cwd: destDir,
  });
  await execa("git", ["commit", "-m", "chore: initial commit [skip ci]"], {
    cwd: destDir,
  });
  await execa("git", ["branch", "--move", "main"], {
    cwd: destDir,
  });
  await execa("git", ["remote", "add", "origin", originUrl], {
    cwd: destDir,
  });
  await execa("git", ["push", "--set-upstream", "origin", "main"], {
    cwd: destDir,
  });
  await execa("git", ["checkout", "-b", "develop"], {
    cwd: destDir,
  });
  await execa("git", ["push", "--set-upstream", "origin", "develop"], {
    cwd: destDir,
  });
}

function formatSteppyGroup(group: string) {
  if (group === "vercel") {
    return chalk.magenta("[vercel]");
  }
  return `[${group}]`;
}

async function run() {
  const { projectName, projectHid, domain } = await getResponses();

  // const templateDir = path.join(__dirname, "..", "template");
  const destDir = path.join(process.cwd(), projectHid);

  // steppy.head("setting up development environment");

  // await steppy.run<LocalStepContext>(localSteps, {
  //   destDir,
  //   templateDir,
  //   projectHid,
  //   projectName,
  // });

  steppy.head("setting up stage environment");

  if (!validateEnvVars(process.env)) {
    throw new Error();
  }

  const {
    NPM_TOKEN: npmToken,
    VERCEL_TOKEN: vercelToken,
    VERCEL_ORG_ID: vercelOrgId,
    GOOGLE_APPLICATION_CREDENTIALS: gcloudCredentialsFile,
  } = process.env;

  const outputs = await steppy.run<RemoteStepContext, RemoteStepOutputs>(
    remoteSteps,
    {
      projectName,
      projectHid,
      destDir,
      domain: `stage.${domain}`,
      envName: "Stage",
      mongoPassword: passwd.generate(),
      vercelOrgId,
      vercelToken,
      npmToken,
      gcloudCredentialsFile,
    },
    { formatGroup: formatSteppyGroup }
  );

  console.log();
  console.log(outputs);
  console.log();
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
