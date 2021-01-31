import URI from "urijs";
import { paramCase } from "change-case";
import prompts from "prompts";
import dotenv from "dotenv";
import dotenvStringify from "dotenv-stringify";
import fs from "fs-extra";
import { Ora } from "ora";
import Mustache from "mustache";
import path from "path";

import { Step } from "./steppy";

import * as vercel from "./vercel";
import * as mongo from "./mongo";
import * as googlecloud from "./google-cloud";
import * as github from "./github";

export type Context = {
  projectName: string;
  projectHid: string;
  destDir: string;
  domain: string;
  envName: string;
  mongoPassword: string;
  vercelToken: string;
  vercelOrgId: string;
  npmToken: string;
  gcloudCredentialsFile: string;
};

export type Outputs = {
  "setting up google cloud": { projectId: string };
  "creating atlas user": void;
  "getting database uri": { uri: string };
  "creating ui project": { projectId: string };
  "creating app project": { projectId: string };
  "setting up github": { repoUrl: string };
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

function makeReplaceTakenIdFn({
  spinner,
  resourceName,
}: {
  spinner: Ora;
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

steps.push({
  group: "google",
  title: "setting up google cloud",
  run: async ({ spinner, projectName, envName }) => {
    const googleProjectName = `${projectName} CMS ${envName}`;
    const idealProjectId = paramCase(googleProjectName);

    const project = await googlecloud.setupProject(
      googleProjectName,
      idealProjectId,
      makeReplaceTakenIdFn({
        spinner,
        resourceName: "Google Project Id",
      })
    );

    return { projectId: project.projectId as string };
  },
});

steps.push({
  group: "mongo",
  title: "creating atlas user",
  run: async ({ projectHid, mongoPassword }) => {
    await mongo.createUser(projectHid, mongoPassword);
  },
});

steps.push({
  group: "mongo",
  title: "getting database uri",
  run: async ({ projectHid, envName, mongoPassword }) => {
    const srvAddress = await mongo.getConnectionString(envName);

    const uri = URI(srvAddress)
      .username(projectHid)
      .password(mongoPassword)
      .pathname(projectHid)
      .query({ retryWrites: "true", w: "majority" })
      .toString();

    return { uri };
  },
});

steps.push({
  group: "vercel",
  title: "creating ui project",
  run: async ({ projectHid, domain, envName }) => {
    const project = await vercel.createProject({
      name: `${projectHid}-ui-${paramCase(envName)}`,
      domain: `ui.${domain}`,
    });
    return { projectId: project.id };
  },
});

steps.push({
  group: "vercel",
  title: "creating app project",
  run: async ({ projectHid, domain, envName }) => {
    const project = await vercel.createProject({
      name: `${projectHid}-app-${paramCase(envName)}`,
      framework: "nextjs",
      domain,
      env: [
        {
          type: "plain",
          key: "GRAPHQL_URL",
          value: `https://cms.${domain}/graphql`,
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
    return { projectId: project.id };
  },
});

steps.push({
  title: "setting up github",
  run: async (
    {
      projectHid,
      spinner,
      envName,
      vercelOrgId,
      vercelToken,
      npmToken,
      gcloudCredentialsFile,
    },
    {
      "getting database uri": { uri: databaseUri },
      "creating ui project": { projectId: uiProjectId },
      "creating app project": { projectId: appProjectId },
      "setting up google cloud": { projectId: gcloudProjectId },
    }
  ) => {
    const repoUrl = await github.createRepo({
      name: projectHid,
      replaceTakenRepoName: makeReplaceTakenIdFn({
        spinner,
        resourceName: "repo name",
      }),
    });

    const gcloudAppYaml = await (async () => {
      const tpl = await fs.readFile(
        path.join(__dirname, "..", "google.app.yml"),
        "utf8"
      );
      const yml = Mustache.render(tpl, {
        nodeEnv: paramCase(envName),
        databaseUri,
      });
      return Buffer.from(yml).toString("base64");
    })();

    const gcloudServiceAccountJSON = await fs.readFile(
      gcloudCredentialsFile,
      "utf8"
    );

    const envUC = envName.toUpperCase();

    await github.addSecrets(projectHid, {
      NPM_TOKEN: npmToken,
      VERCEL_TOKEN: vercelToken,
      VERCEL_ORG_ID: vercelOrgId,
      [`VERCEL_APP_PROJECT_ID_${envUC}`]: appProjectId,
      [`VERCEL_UI_PROJECT_ID_${envUC}`]: uiProjectId,
      [`GCLOUD_PROJECT_ID_${envUC}`]: gcloudProjectId,
      [`GCLOUD_APP_YAML_BASE64_${envUC}`]: gcloudAppYaml,
      GCLOUD_SERVICE_ACCOUNT_JSON: gcloudServiceAccountJSON,
    });

    return { repoUrl };
  },
});

// await extendDotEnv(path.join(destDir, "packages", "cms", ".env"), {
//   DATABASE_URI_STAGE: cmsDatabaseUriStage,
// });

// await extendDotEnv(path.join(destDir, "packages", "cms", ".env"), {
//   GCLOUD_PROJECT_ID_STAGE: gcloudProjectIdStage,
// });

// await extendDotEnv(path.join(destDir, "packages", "ui", ".env"), {
//   VERCEL_TOKEN: process.env.VERCEL_TOKEN,
//   VERCEL_ORG_ID: process.env.VERCEL_ORG_ID,
//   VERCEL_PROJECT_ID_STAGE: uiProjectIdStage,
// });

// await extendDotEnv(path.join(destDir, "packages", "app", ".env"), {
//   VERCEL_TOKEN: process.env.VERCEL_TOKEN,
//   VERCEL_ORG_ID: process.env.VERCEL_ORG_ID,
//   VERCEL_PROJECT_ID_STAGE: appProjectIdStage,
// });

export default steps;
