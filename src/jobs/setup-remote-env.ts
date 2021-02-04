import URI from "urijs";
import fs from "fs-extra";
import Mustache from "mustache";
import path from "path";
import dotenv from "dotenv";
import dotenvStringify from "dotenv-stringify";

import { EnvDescriptor, Caveat } from "../create-mindful-project";
import { Step } from "../lib/steppy";

import * as vercel from "../lib/vercel";
import * as mongo from "../lib/mongo";
import * as googlecloud from "../lib/google-cloud";
import * as github from "../lib/github";

export type Context = {
  projectName: string;
  projectHid: string;
  destDir: string;
  domain: string;
  env: EnvDescriptor;
  mongoPassword: string;
  vercelToken: string;
  vercelOrgId: string;
};

export type Outputs = {
  "creating atlas user": void;
  "getting database uri": { uri: string };
  "setting up google cloud": { projectId: string; appYaml: string };
  "creating ui project": { projectId: string };
  "creating app project": { projectId: string };
  "adding github env vars": void;
  "updating .env files": void;
  "adding google app.yml file to cms": void;
};

const steps: Step<Context, Outputs, Caveat>[] = [];

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
  group: "mongo",
  title: "creating atlas user",
  run: async ({ projectHid, mongoPassword, caveat }) => {
    const user = await mongo.getUser(projectHid);
    if (user !== null) {
      caveat.add("ATLAS_USER_EXISTS");
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
  group: "google",
  title: "setting up google cloud",
  run: async (
    { projectHid, projectName, env, caveat },
    { "getting database uri": { uri: databaseUri } }
  ) => {
    const googleProjectName = `${projectName} CMS ${env.shortName}`;
    const projectId = `${projectHid}-cms-${env.slug}`;

    let project = await googlecloud.getProject(projectId);

    if (project !== null) {
      caveat.add("GCLOUD_PROJECT_EXISTS");
    } else {
      project = await googlecloud.setupProject(googleProjectName, projectId);
    }

    const appYaml = Mustache.render(
      await fs.readFile(
        path.join(__dirname, "..", "..", "google.app.yml"),
        "utf8"
      ),
      { nodeEnv: env.nodeEnv, databaseUri }
    );

    return {
      projectId: project.projectId as string,
      appYaml: appYaml,
    };
  },
});

steps.push({
  group: "vercel",
  title: "creating ui project",
  run: async ({ projectHid, domain, env, caveat }) => {
    const name = `${projectHid}-ui-${env.slug}`;
    let project = await vercel.getProject(name);

    if (project !== null) {
      caveat.add("VERCEL_PROJECT_EXISTS");
    } else {
      project = await vercel.createProject({ name, domain: `ui.${domain}` });
    }

    return { projectId: project.id };
  },
});

steps.push({
  group: "vercel",
  title: "creating app project",
  run: async ({ projectHid, domain, env, caveat }) => {
    const name = `${projectHid}-app-${env.slug}`;
    let project = await vercel.getProject(name);

    if (project !== null) {
      caveat.add("VERCEL_PROJECT_EXISTS");
    } else {
      project = await vercel.createProject({
        name,
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
    }

    return { projectId: project.id };
  },
});

steps.push({
  group: "github",
  title: "adding github env vars",
  run: async (
    { projectHid, env },
    {
      "creating ui project": { projectId: uiProjectId },
      "creating app project": { projectId: appProjectId },
      "setting up google cloud": {
        projectId: gcloudProjectId,
        appYaml: gcloudAppYaml,
      },
    }
  ) => {
    const gcloudAppYamlBase64 = Buffer.from(gcloudAppYaml).toString("base64");
    await github.addSecrets(projectHid, {
      [`VERCEL_APP_PROJECT_ID_${env.constantSuffix}`]: appProjectId,
      [`VERCEL_UI_PROJECT_ID_${env.constantSuffix}`]: uiProjectId,
      [`GCLOUD_PROJECT_ID_${env.constantSuffix}`]: gcloudProjectId,
      [`GCLOUD_APP_YAML_BASE64_${env.constantSuffix}`]: gcloudAppYamlBase64,
    });
  },
});

steps.push({
  group: "local",
  title: "updating .env files",
  run: async (
    { env, destDir, projectHid, vercelToken, vercelOrgId },
    {
      "getting database uri": { uri: databaseUri },
      "creating ui project": { projectId: uiProjectId },
      "creating app project": { projectId: appProjectId },
      "setting up google cloud": { projectId: gcloudProjectId },
    }
  ) => {
    await extendDotEnv(
      path.join(destDir, "packages", `${projectHid}-cms`, ".env"),
      {
        [`DATABASE_URI_${env.constantSuffix}`]: databaseUri,
        [`GCLOUD_PROJECT_ID_${env.constantSuffix}`]: gcloudProjectId,
      }
    );
    await extendDotEnv(
      path.join(destDir, "packages", `${projectHid}-ui`, ".env"),
      {
        VERCEL_TOKEN: vercelToken,
        VERCEL_ORG_ID: vercelOrgId,
        [`VERCEL_PROJECT_ID_${env.constantSuffix}`]: uiProjectId,
      }
    );
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
  group: "local",
  title: "adding google app.yml file to cms",
  run: async (
    { env, destDir, projectHid },
    { "setting up google cloud": { appYaml: gcloudAppYaml } }
  ) => {
    await fs.writeFile(
      path.join(
        destDir,
        "packages",
        `${projectHid}-cms`,
        `app.${env.slug}.yml`
      ),
      gcloudAppYaml
    );
  },
});

export { steps };
