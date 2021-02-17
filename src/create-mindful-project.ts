import "source-map-support/register";
import path from "path";

import * as steppy from "./lib/steppy";

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
  googleHid?: string;
  mongoProjectIdStage: string;
  mongoUserIdStage: string;
  mongoUserTokenStage: string;
  mongoProjectIdProd: string;
  mongoUserIdProd: string;
  mongoUserTokenProd: string;
  mongoPassword: string;
  destDir: string;
};

export default async function createMindfulProject({
  projectName,
  projectHid,
  domain,
  npmToken,
  vercelToken,
  vercelOrgId,
  gcloudCredentialsFile,
  googleHid,
  mongoProjectIdStage,
  mongoUserIdStage,
  mongoUserTokenStage,
  mongoProjectIdProd,
  mongoUserIdProd,
  mongoUserTokenProd,
  mongoPassword,
  destDir,
}: Params) {
  const templateDir = path.join(__dirname, "..", "template");

  steppy.head("setting up dev environment");
  const devOutputs = await steppy.run<
    SetupLocalEnv.Context,
    SetupLocalEnv.Outputs,
    Caveat
  >(SetupLocalEnv.steps, {
    projectHid,
    destDir,
    templateDir,
    projectName,
  });

  steppy.head("setting up github");
  const githubOutputs = await steppy.run<
    SetupGithub.Context,
    SetupGithub.Outputs,
    Caveat
  >(SetupGithub.steps, {
    destDir,
    projectHid,
    vercelOrgId,
    vercelToken,
    npmToken,
    gcloudCredentialsFile,
  });

  steppy.head("setting up stage environment");
  const stageOutputs = await steppy.run<
    SetupRemoteEnv.Context,
    SetupRemoteEnv.Outputs,
    Caveat
  >(SetupRemoteEnv.steps, {
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
    googleHid,
    mongoUserId: mongoUserIdStage,
    mongoUserToken: mongoUserTokenStage,
    mongoProjectId: mongoProjectIdStage,
    mongoPassword,
    vercelToken,
    vercelOrgId,
  });

  steppy.head("setting up production environment");
  const productionOutputs = await steppy.run<
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
    googleHid,
    mongoUserId: mongoUserIdProd,
    mongoUserToken: mongoUserTokenProd,
    mongoProjectId: mongoProjectIdProd,
    mongoPassword,
    vercelToken,
    vercelOrgId,
  });

  return {
    devOutputs,
    githubOutputs,
    stageOutputs,
    productionOutputs,
    caveats: steppy.caveats(),
  };
}
