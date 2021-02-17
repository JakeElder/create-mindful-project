import fs from "fs-extra";

import { Caveat } from "../create-mindful-project";

import * as git from "../lib/git";
import * as github from "../lib/github";
import { Step } from "../lib/steppy";

export type Context = {
  destDir: string;
  projectHid: string;
  vercelOrgId: string;
  vercelToken: string;
  npmToken: string;
  gcloudCredentialsFile: string;
};

export type Outputs = {
  "setting up github": { repoUrl: string };
  "adding git remote": void;
};

const steps: Step<Context, Outputs, Caveat>[] = [];

steps.push({
  group: "github",
  title: "setting up github",
  run: async ({
    projectHid,
    vercelOrgId,
    vercelToken,
    npmToken,
    gcloudCredentialsFile,
    caveat,
  }) => {
    let repo = await github.getRepo(projectHid);

    if (repo !== null) {
      caveat.add("GITHUB_REPO_EXISTS");
      return { repoUrl: repo.ssh_url };
    }

    const { ssh_url } = await github.createRepo({ name: projectHid });

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

    return { repoUrl: ssh_url };
  },
});

steps.push({
  group: "local",
  title: "adding git remote",
  run: async ({ destDir, caveat }, { "setting up github": { repoUrl } }) => {
    git.cd(destDir);
    await git.remote("add", "origin", repoUrl);
    if (!caveat.exists("GITHUB_REPO_EXISTS")) {
      await git.checkout("main");
      await git.push("--set-upstream", "origin", "main");
      await git.checkout("develop");
      await git.push("--set-upstream", "origin", "develop");
    }
  },
});

export { steps };
