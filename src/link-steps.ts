import path from "path";
import dotenv from "dotenv";
import dotenvStringify from "dotenv-stringify";
import fs from "fs-extra";
import Mustache from "mustache";

import { EnvDescriptor } from ".";
import { Step } from "./steppy";

import * as git from "./git";

export type Context = {
  projectHid: string;
  destDir: string;
  env: EnvDescriptor;
  vercelToken: string;
  vercelOrgId: string;
  cmsDatabaseUri: string;
  gcloudProjectId: string;
  uiProjectId: string;
  appProjectId: string;
  githubRepoUrl: string;
  skipGit?: boolean;
};

export type Outputs = {
  "updating cms .env file": void;
  "updating ui .env file": void;
  "updating app .env file": void;
  "adding google app.yml file to cms": void;
  "setting up git remote": void;
};

const steps: Step<Context, Outputs>[] = [];

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

steps.push({
  title: "updating cms .env file",
  run: async ({
    env,
    destDir,
    cmsDatabaseUri,
    gcloudProjectId,
    projectHid,
  }) => {
    await extendDotEnv(
      path.join(destDir, "packages", `${projectHid}-cms`, ".env"),
      {
        [`DATABASE_URI_${env.constantSuffix}`]: cmsDatabaseUri,
        [`GCLOUD_PROJECT_ID_${env.constantSuffix}`]: gcloudProjectId,
      }
    );
  },
});

steps.push({
  title: "updating ui .env file",
  run: async ({
    vercelOrgId,
    vercelToken,
    env,
    destDir,
    uiProjectId,
    projectHid,
  }) => {
    await extendDotEnv(
      path.join(destDir, "packages", `${projectHid}-ui`, ".env"),
      {
        VERCEL_TOKEN: vercelToken,
        VERCEL_ORG_ID: vercelOrgId,
        [`VERCEL_PROJECT_ID_${env.constantSuffix}`]: uiProjectId,
      }
    );
  },
});

steps.push({
  title: "updating app .env file",
  run: async ({
    vercelOrgId,
    vercelToken,
    env,
    destDir,
    appProjectId,
    projectHid,
  }) => {
    await extendDotEnv(
      path.join(destDir, "packages", `${projectHid}-app`, ".env"),
      {
        VERCEL_TOKEN: vercelToken,
        VERCEL_ORG_ID: vercelOrgId,
        [`VERCEL_PROJECT_ID_${env.constantSuffix}`]: appProjectId,
      }
    );
  },
});

steps.push({
  title: "adding google app.yml file to cms",
  run: async ({ cmsDatabaseUri, env, destDir, projectHid }) => {
    const tpl = await fs.readFile(
      path.join(__dirname, "..", "google.app.yml"),
      "utf8"
    );
    await fs.writeFile(
      path.join(
        destDir,
        "packages",
        `${projectHid}-cms`,
        `app.${env.slug}.yml`
      ),
      Mustache.render(tpl, {
        nodeEnv: env.nodeEnv,
        databaseUri: cmsDatabaseUri,
      })
    );
  },
});

steps.push({
  title: "setting up git remote",
  run: async ({ destDir, githubRepoUrl, skipGit }) => {
    if (skipGit) {
      return;
    }
    git.cd(destDir);
    await git.remote("add", "origin", githubRepoUrl);
    await git.checkout("main");
    await git.push("--set-upstream", "origin", "main");
    await git.checkout("develop");
    await git.push("--set-upstream", "origin", "develop");
  },
});

export default steps;
