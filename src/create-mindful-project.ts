import "source-map-support/register";
import chalk from "chalk";
import path from "path";

import * as steppy from "./steppy";

import * as SetupLocalEnv from "./jobs/setup-local-env";
import * as SetupGithub from "./jobs/setup-github";
import * as SetupRemoteEnv from "./jobs/setup-remote-env";

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

type Params = {
  projectName: string;
  projectHid: string;
  domain: string;
  npmToken: string;
  vercelToken: string;
  vercelOrgId: string;
  gcloudCredentialsFile: string;
  mongoPassword: string;
};

export default async function createMindfulProject({
  projectName,
  projectHid,
  domain,
  npmToken,
  vercelToken,
  vercelOrgId,
  gcloudCredentialsFile,
  mongoPassword,
}: Params) {
  const templateDir = path.join(__dirname, "..", "template");
  const destDir = path.join(process.cwd(), projectHid);

  steppy.head("setting up dev environment");
  await steppy.run<SetupLocalEnv.Context, SetupLocalEnv.Outputs, Caveat>(
    SetupLocalEnv.steps,
    {
      projectHid,
      destDir,
      templateDir,
      projectName,
    }
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
    }
  );

  steppy.head("setting up production environment");
  const o = await steppy.run<
    SetupRemoteEnv.Context,
    SetupRemoteEnv.Outputs,
    Caveat
  >(SetupRemoteEnv.steps, {
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
  });

  console.log();
  console.log(steppy.caveats());
}
