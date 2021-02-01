import URI from "urijs";
import { paramCase } from "change-case";
import prompts from "prompts";
import fs from "fs-extra";
import { Ora } from "ora";
import Mustache from "mustache";
import path from "path";

import { EnvDescriptor } from ".";
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
  env: EnvDescriptor;
  mongoPassword: string;
  vercelToken: string;
  vercelOrgId: string;
  npmToken: string;
  gcloudCredentialsFile: string;
  gcloudProjectId?: string;
  githubRepoUrl?: string;
  mongoUserCreated?: boolean;
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
  run: async ({ spinner, projectHid, projectName, env, gcloudProjectId }) => {
    if (gcloudProjectId) {
      return { projectId: gcloudProjectId };
    }

    const googleProjectName = `${projectName} CMS ${env.shortName}`;
    const idealProjectId = `${projectHid}-cms-${env.slug}`;

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
  run: async ({ projectHid, mongoPassword, mongoUserCreated }) => {
    if (mongoUserCreated) {
      return;
    }
    await mongo.createUser(projectHid, mongoPassword);
  },
});

steps.push({
  group: "mongo",
  title: "getting database uri",
  run: async ({ projectHid, env, mongoPassword }) => {
    const srvAddress = await mongo.getConnectionString(env.name);

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
  run: async ({ projectHid, domain, env }) => {
    const project = await vercel.createProject({
      name: `${projectHid}-ui-${env.slug}`,
      domain: `ui.${domain}`,
    });
    return { projectId: project.id };
  },
});

steps.push({
  group: "vercel",
  title: "creating app project",
  run: async ({ projectHid, domain, env }) => {
    const project = await vercel.createProject({
      name: `${projectHid}-app-${env.slug}`,
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
  group: "github",
  title: "setting up github",
  run: async (
    {
      projectHid,
      spinner,
      env,
      vercelOrgId,
      vercelToken,
      npmToken,
      gcloudCredentialsFile,
      githubRepoUrl,
    },
    {
      "getting database uri": { uri: databaseUri },
      "creating ui project": { projectId: uiProjectId },
      "creating app project": { projectId: appProjectId },
      "setting up google cloud": { projectId: gcloudProjectId },
    }
  ) => {
    let repoUrl;

    if (githubRepoUrl) {
      repoUrl = githubRepoUrl;
    } else {
      repoUrl = await github.createRepo({
        name: projectHid,
        replaceTakenRepoName: makeReplaceTakenIdFn({
          spinner,
          resourceName: "repo name",
        }),
      });
    }

    const gcloudAppYaml = await (async () => {
      const tpl = await fs.readFile(
        path.join(__dirname, "..", "google.app.yml"),
        "utf8"
      );
      const yml = Mustache.render(tpl, {
        nodeEnv: env.nodeEnv,
        databaseUri,
      });
      return Buffer.from(yml).toString("base64");
    })();

    if (!githubRepoUrl) {
      const gcloudServiceAccountJSON = await fs.readFile(
        gcloudCredentialsFile,
        "utf8"
      );
      await github.addSecrets(projectHid, {
        NPM_TOKEN: npmToken,
        VERCEL_TOKEN: vercelToken,
        VERCEL_ORG_ID: vercelOrgId,
        GCLOUD_SERVICE_ACCOUNT_JSON: gcloudServiceAccountJSON,
      });
    }

    await github.addSecrets(projectHid, {
      [`VERCEL_APP_PROJECT_ID_${env.constantSuffix}`]: appProjectId,
      [`VERCEL_UI_PROJECT_ID_${env.constantSuffix}`]: uiProjectId,
      [`GCLOUD_PROJECT_ID_${env.constantSuffix}`]: gcloudProjectId,
      [`GCLOUD_APP_YAML_BASE64_${env.constantSuffix}`]: gcloudAppYaml,
    });

    return { repoUrl };
  },
});

export default steps;
