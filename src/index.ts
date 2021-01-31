#!/usr/bin/env node

import "source-map-support/register";
import fs from "fs-extra";
import path from "path";
import prompts from "prompts";
import { paramCase } from "change-case";
import ora from "ora";
import dotenv from "dotenv";
import dotenvStringify from "dotenv-stringify";
import PrettyError from "pretty-error";
import passwd from "generate-password";
import URI from "urijs";
import execa from "execa";
import Mustache from "mustache";

import * as googlecloud from "./google-cloud";
import * as vercel from "./vercel";
import * as github from "./github";
import * as mongo from "./mongo";
import * as steppy from "./steppy";

import localSteps, { Context as LocalStepContext } from "./local-steps";
import remoteSteps, {
  Context as RemoteStepContext,
  Outputs as RemoteStepOutputs,
} from "./remote-steps";

class PromptCancelledError extends Error {}
class MissingEnvVarError extends Error {}

async function getResponses() {
  return prompts(
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

async function extendDotEnv(filePath: string, object: { [key: string]: any }) {
  const env = dotenv.parse(await fs.readFile(filePath));
  await fs.writeFile(
    filePath,
    dotenvStringify({
      ...env,
      ...object,
    })
  );
}

function makeReplaceTakenIdFn({
  spinner,
  resourceName,
}: {
  spinner: ora.Ora;
  resourceName: string;
}) {
  return async function replaceTakenId(takenId: string) {
    spinner.stop();
    const { compromiseId } = await prompts({
      type: "text",
      name: "compromiseId",
      initial: takenId,
      message: `This ${resourceName} is taken. What should the id be?`,
    });
    spinner.start();
    return compromiseId;
  };
}

async function run() {
  const {
    projectName,
    projectHid,
    domain,
  }: {
    projectName: string;
    projectHid: string;
    domain: string;
  } = await getResponses();

  let uiProjectIdStage: string;
  let appProjectIdStage: string;
  let gcloudProjectIdStage: string;
  let cmsDatabaseUriStage: string;
  let githubOriginUrl: string;

  const _steps = [
    {
      label: "Setting UI env variables",
      run: () => {
        return extendDotEnv(path.join(destDir, "packages", "ui", ".env"), {
          VERCEL_TOKEN: process.env.VERCEL_TOKEN,
          VERCEL_ORG_ID: process.env.VERCEL_ORG_ID,
          VERCEL_PROJECT_ID_STAGE: uiProjectIdStage,
        });
      },
    },
    {
      label: "Setting up Vercel App project",
      run: async () => {
        const project = await vercel.createProject({
          name: `${projectHid}-app-stage`,
          framework: "nextjs",
          domain: `stage.${domain}`,
          env: [
            {
              type: "plain",
              key: "GRAPHQL_URL",
              value: `https://cms.stage.${domain}/graphql`,
              target: ["production", "preview"],
            },
            {
              type: "secret",
              key: "NPM_TOKEN",
              value: await vercel.getSecretId("npm-token"),
              target: ["production", "preview"],
            },
          ],
        });
        appProjectIdStage = project.id;
      },
    },
    {
      label: "Setting App env variables",
      run: async () => {
        await extendDotEnv(path.join(destDir, "packages", "app", ".env"), {
          VERCEL_TOKEN: process.env.VERCEL_TOKEN,
          VERCEL_ORG_ID: process.env.VERCEL_ORG_ID,
          VERCEL_PROJECT_ID_STAGE: appProjectIdStage,
        });
      },
    },
    {
      label: "Setting up Google Cloud",
      run: async (spinner: ora.Ora) => {
        const googleProjectName = `${projectName} CMS Stage`;
        const idealProjectId = paramCase(googleProjectName);
        async function replaceTakenId(takenId: string) {
          spinner.stop();
          const { compromiseProjectId } = await prompts({
            type: "text",
            name: "compromiseProjectId",
            initial: takenId,
            message: "This Google Project id is taken. What should the id be?",
          });
          spinner.start();
          return compromiseProjectId;
        }
        const project = await googlecloud.setupProject(
          googleProjectName,
          idealProjectId,
          replaceTakenId
        );
        gcloudProjectIdStage = project.projectId as string;
        await extendDotEnv(path.join(destDir, "packages", "cms", ".env"), {
          GCLOUD_PROJECT_ID_STAGE: gcloudProjectIdStage,
        });
      },
    },
    {
      label: "Setting up Mongo DB",
      run: async () => {
        const password = passwd.generate();
        await mongo.createUser(projectHid, password);
        const srvAddress = await mongo.getConnectionString("Stage");

        cmsDatabaseUriStage = URI(srvAddress)
          .username(projectHid)
          .password(password)
          .pathname(projectHid)
          .query({ retryWrites: "true", w: "majority" })
          .toString();

        await extendDotEnv(path.join(destDir, "packages", "cms", ".env"), {
          DATABASE_URI_STAGE: cmsDatabaseUriStage,
        });
      },
    },
    {
      label: "Setting up Github",
      run: async (spinner: any) => {
        githubOriginUrl = await github.createRepo({
          name: projectHid,
          replaceTakenRepoName: makeReplaceTakenIdFn({
            spinner,
            resourceName: "repo name",
          }),
        });

        const { NPM_TOKEN, VERCEL_TOKEN, VERCEL_ORG_ID } = process.env;

        if (
          typeof NPM_TOKEN !== "string" ||
          typeof VERCEL_TOKEN !== "string" ||
          typeof VERCEL_ORG_ID !== "string"
        ) {
          throw new Error();
        }

        const GCLOUD_APP_YAML_BASE64_STAGE = await (async () => {
          const tpl = await fs.readFile(
            `${destDir}/packages/cms/app.stage.yml`,
            "utf8"
          );
          const yml = Mustache.render(tpl, { cmsDatabaseUriStage });
          return Buffer.from(yml).toString("base64");
        })();

        if (typeof process.env.GOOGLE_APPLICATION_CREDENTIALS !== "string") {
          throw new MissingEnvVarError();
        }

        const GCLOUD_SERVICE_ACCOUNT_JSON = await fs.readFile(
          process.env.GOOGLE_APPLICATION_CREDENTIALS as string,
          "utf8"
        );

        await github.addSecrets(projectHid, {
          NPM_TOKEN: NPM_TOKEN,
          VERCEL_TOKEN: VERCEL_TOKEN,
          VERCEL_ORG_ID: VERCEL_ORG_ID,
          VERCEL_APP_PROJECT_ID_STAGE: appProjectIdStage,
          VERCEL_UI_PROJECT_ID_STAGE: uiProjectIdStage,
          GCLOUD_PROJECT_ID_STAGE: gcloudProjectIdStage,
          GCLOUD_APP_YAML_BASE64_STAGE,
          GCLOUD_SERVICE_ACCOUNT_JSON,
        });
      },
    },
  ];

  const templateDir = path.join(__dirname, "..", "template");
  const destDir = path.join(process.cwd(), projectHid);

  steppy.head("setting up development environment");

  // await steppy.run<LocalStepContext>(localSteps, {
  //   destDir,
  //   templateDir,
  //   projectHid,
  //   projectName,
  // });

  steppy.head("setting up stage environment");

  const outputs = await steppy.run<RemoteStepContext, RemoteStepOutputs>(
    remoteSteps,
    {
      projectHid,
      domain,
    }
  );

  outputs["creating ui project"];
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
