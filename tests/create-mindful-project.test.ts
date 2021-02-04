import path from "path";
import { nanoid } from "nanoid";
import { promises as fs } from "fs";
import nock from "nock";
import dotenv from "dotenv";

import * as steppy from "../src/lib/steppy";
import SilentFormatter from "../src/lib/steppy/formatters/silent";
import cmpr from "../src/create-mindful-project";

const fixture = {
  googleProject({ projectId }: { projectId: string }) {
    const base = require("./fixtures/google-project.json");
    return { ...base, projectId };
  },
  githubRepo({ sshUrl }: { sshUrl: string }) {
    const base = require("./fixtures/github-repo.json");
    return { ...base, ssh_url: sshUrl };
  },
  vercelProject({ projectId }: { projectId: string }) {
    const base = require("./fixtures/vercel-project.json");
    return { ...base, id: projectId };
  },
  mongoUser() {
    return require("./fixtures/mongo-user.json");
  },
  mongoConnectionString({
    user,
    password,
    env,
  }: {
    user: string;
    password: string;
    env: string;
  }) {
    return "".concat(
      `mongodb+srv://${user}:${password}@${env}.4panj.mongodb.net`,
      `/${user}?retryWrites=true&w=majority`
    );
  },
};

test("uses exists projects if they exist", async () => {
  // make sure all apis are mocked
  nock.disableNetConnect();

  // require apis
  const github = require("../src/lib/github");
  const mongo = require("../src/lib/mongo");
  const googlecloud = require("../src/lib/google-cloud");
  const vercel = require("../src/lib/vercel");

  // spy on used api methods
  jest.spyOn(github, "getRepo");
  jest.spyOn(github, "addSecrets");
  jest.spyOn(mongo, "getUser");
  jest.spyOn(mongo, "getConnectionString");
  jest.spyOn(googlecloud, "getProject");
  jest.spyOn(vercel, "getProject");

  // setting up github :: github
  github.getRepo.mockResolvedValueOnce(
    fixture.githubRepo({
      sshUrl: "git@github.com:mindful-studio/mpr.git",
    })
  );

  // setting up stage :: mongo
  mongo.getUser.mockResolvedValueOnce(fixture.mongoUser());
  mongo.getConnectionString.mockResolvedValueOnce(
    fixture.mongoConnectionString({
      user: "mpr",
      password: "pswd",
      env: "stage",
    })
  );

  // setting up stage :: google
  googlecloud.getProject.mockResolvedValueOnce(
    fixture.googleProject({ projectId: "mpr-cms-stage" })
  );

  // setting up stage :: vercel
  vercel.getProject
    .mockResolvedValueOnce(fixture.vercelProject({ projectId: "mpr-ui-stage" }))
    .mockResolvedValueOnce(
      fixture.vercelProject({ projectId: "mpr-app-stage" })
    );

  // setting up stage :: github env vars
  github.addSecrets.mockResolvedValueOnce(null);

  // setting up production :: mongo
  mongo.getUser.mockResolvedValueOnce(fixture.mongoUser());
  mongo.getConnectionString.mockResolvedValueOnce(
    fixture.mongoConnectionString({
      user: "mpr",
      password: "pswd",
      env: "production",
    })
  );

  // setting up production :: google
  googlecloud.getProject.mockResolvedValueOnce(
    fixture.googleProject({ projectId: "mpr-cms-prod" })
  );

  // setting up production :: vercel
  vercel.getProject
    .mockResolvedValueOnce(fixture.vercelProject({ projectId: "mpr-ui-prod" }))
    .mockResolvedValueOnce(
      fixture.vercelProject({ projectId: "mpr-app-prod" })
    );

  // setting up production :: github env vars
  github.addSecrets.mockResolvedValueOnce(null);

  // set up steppy
  const destDir = path.join(__dirname, ".test.tmp", nanoid());
  const formatter = new SilentFormatter();
  steppy.setFormatter(formatter);

  // run cmpr
  let result: any;

  try {
    result = await cmpr({
      npmToken: "npm-tok3n",
      vercelOrgId: "v3rc3l-0rg-id",
      vercelToken: "v3rc3l-t0k3n",
      gcloudCredentialsFile: "/google-credentials.json",
      destDir,
      domain: "mindfulstudio.io",
      projectHid: "mpr",
      projectName: "MPR",
      mongoPassword: "pswd",
    });
  } catch (e) {
    await fs.rmdir(destDir, { recursive: true });
    fail(e.message);
  }

  // check outputs are correct
  expect(result).toStrictEqual({
    devOutputs: {},
    githubOutputs: {
      "setting up github": {
        repoUrl: "git@github.com:mindful-studio/mpr.git",
      },
    },
    stageOutputs: {
      "getting database uri": {
        uri:
          "mongodb+srv://mpr:pswd@stage.4panj.mongodb.net/mpr?retryWrites=true&w=majority",
      },
      "setting up google cloud": {
        projectId: "mpr-cms-stage",
        appYaml:
          "runtime: nodejs14\n" +
          "instance_class: F2\n" +
          "env_variables:\n" +
          '  NODE_ENV: "stage"\n' +
          '  DATABASE_URI: "mongodb+srv://mpr:pswd@stage.4panj.mongodb.net/mpr?retryWrites=true&w=majority"\n',
      },
      "creating ui project": { projectId: "mpr-ui-stage" },
      "creating app project": { projectId: "mpr-app-stage" },
    },
    productionOutputs: {
      "getting database uri": {
        uri:
          "mongodb+srv://mpr:pswd@production.4panj.mongodb.net/mpr?retryWrites=true&w=majority",
      },
      "setting up google cloud": {
        projectId: "mpr-cms-prod",
        appYaml:
          "runtime: nodejs14\n" +
          "instance_class: F2\n" +
          "env_variables:\n" +
          '  NODE_ENV: "production"\n' +
          '  DATABASE_URI: "mongodb+srv://mpr:pswd@production.4panj.mongodb.net/mpr?retryWrites=true&w=majority"\n',
      },
      "creating ui project": { projectId: "mpr-ui-prod" },
      "creating app project": { projectId: "mpr-app-prod" },
    },
    caveats: [
      "GITHUB_REPO_EXISTS",
      "ATLAS_USER_EXISTS",
      "GCLOUD_PROJECT_EXISTS",
      "VERCEL_PROJECT_EXISTS",
      "VERCEL_PROJECT_EXISTS",
      "ATLAS_USER_EXISTS",
      "GCLOUD_PROJECT_EXISTS",
      "VERCEL_PROJECT_EXISTS",
      "VERCEL_PROJECT_EXISTS",
    ],
  });

  try {
    // check directory structure is correct
    await expect(
      fs.access(path.join(destDir, "package.json"))
    ).resolves.not.toThrow();
    await expect(
      fs.access(path.join(destDir, "packages", "mpr-app"))
    ).resolves.not.toThrow();
    await expect(
      fs.access(path.join(destDir, "packages", "mpr-ui", ".env"))
    ).resolves.not.toThrow();

    // check templates have been templated correctly
    const uiPackageJson = require(path.join(
      destDir,
      "packages",
      "mpr-ui",
      "package.json"
    ));
    expect(uiPackageJson.name).toBe("@mindfulstudio/mpr-ui");

    // check env vars have been properly set
    expect(
      dotenv.parse(
        await fs.readFile(path.join(destDir, "packages", "mpr-cms", ".env"))
      )
    ).toEqual({
      DATABASE_URI: "mongodb://localhost:27017/mpr",
      DATABASE_URI_STAGE: fixture.mongoConnectionString({
        env: "stage",
        user: "mpr",
        password: "pswd",
      }),
      GCLOUD_PROJECT_ID_STAGE: "mpr-cms-stage",
      DATABASE_URI_PROD: fixture.mongoConnectionString({
        env: "production",
        user: "mpr",
        password: "pswd",
      }),
      GCLOUD_PROJECT_ID_PROD: "mpr-cms-prod",
    });
  } catch (e) {
    await fs.rmdir(destDir, { recursive: true });
    fail(e.message);
  } finally {
    await fs.rmdir(destDir, { recursive: true });
  }
});
