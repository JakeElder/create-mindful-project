#!/usr/bin/env node

import "source-map-support/register";
import Mustache from "mustache";
import fs from "fs-extra";
import prompts from "prompts";
import { paramCase } from "change-case";
import path from "path";
import { lsrAsync } from "lsr";
import { isBinaryFile } from "isbinaryfile";
import filterAsync from "node-filter-async";
import ora from "ora";
import dotenv from "dotenv";
import dotenvStringify from "dotenv-stringify";
import PrettyError from "pretty-error";
import passwd from "generate-password";
import URI from "urijs";
import execa from "execa";
import * as googlecloud from "./google-cloud";
import * as vercel from "./vercel";
import * as github from "./github";
import * as mongo from "./mongo";
import { Writable } from "stream";

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

async function injectTemplateVars({
  destDir,
  projectName,
  projectHid,
  cmsDatabaseUriStage,
}: {
  destDir: string;
  projectName: string;
  projectHid: string;
  cmsDatabaseUriStage?: string;
}) {
  // Get recursive template directory listings
  const files = await lsrAsync(destDir);

  // Filter out directories and binary files
  const nonBinaryFiles = await filterAsync(files, async (file) => {
    if (file.isDirectory()) {
      return Promise.resolve(false);
    }
    return !(await isBinaryFile(file.fullPath));
  });

  // Inject template variables and rewrite to disk
  await Promise.all(
    nonBinaryFiles.map(async (file) => {
      const c = await fs.readFile(file.fullPath);
      await fs.writeFile(
        file.fullPath,
        Mustache.render(c.toString(), {
          projectName,
          projectHid,
          cmsDatabaseUriStage,
        })
      );
    })
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

type Step = {
  label: string;
  run: (spinner: ora.Ora) => Promise<void>;
  skip?: boolean;
  isolate?: boolean;
};

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

  const templateDir = path.join(__dirname, "..", "template");
  const destDir = path.join(process.cwd(), projectHid);

  // const _steps: Step[] = [
  //   {
  //     label: "Copying template files",
  //     run: () => fs.copy(templateDir, destDir),
  //   },
  //   {
  //     label: "Adding .env files",
  //     run: () => addEnvFiles({ destDir }),
  //   },
  //   {
  //     label: "Initialising CMS",
  //     run: () => seedCMS({ projectName, projectHid }),
  //   },

  //   {
  //     label: "Setting up Vercel UI project",
  //     run: async () => {
  //       const project = await vercel.createProject({
  //         name: `${projectHid}-ui-stage`,
  //         domain: `ui.stage.${domain}`,
  //       });
  //       uiProjectIdStage = project.id;
  //     },
  //   },
  //   {
  //     label: "Setting UI env variables",
  //     run: () => {
  //       return extendDotEnv(path.join(destDir, "packages", "ui", ".env"), {
  //         VERCEL_TOKEN: process.env.VERCEL_TOKEN,
  //         VERCEL_ORG_ID: process.env.VERCEL_ORG_ID,
  //         VERCEL_PROJECT_ID_STAGE: uiProjectIdStage,
  //       });
  //     },
  //   },
  //   {
  //     label: "Setting up Vercel App project",
  //     run: async () => {
  //       const project = await vercel.createProject({
  //         name: `${projectHid}-app-stage`,
  //         framework: "nextjs",
  //         domain: `stage.${domain}`,
  //         env: [
  //           {
  //             type: "plain",
  //             key: "GRAPHQL_URL",
  //             value: `https://cms.stage.${domain}/graphql`,
  //             target: ["production", "preview"],
  //           },
  //           {
  //             type: "secret",
  //             key: "NPM_TOKEN",
  //             value: await vercel.getSecretId("npm-token"),
  //             target: ["production", "preview"],
  //           },
  //         ],
  //       });
  //       appProjectIdStage = project.id;
  //     },
  //   },
  //   {
  //     label: "Setting App env variables",
  //     run: async () => {
  //       await extendDotEnv(path.join(destDir, "packages", "app", ".env"), {
  //         VERCEL_TOKEN: process.env.VERCEL_TOKEN,
  //         VERCEL_ORG_ID: process.env.VERCEL_ORG_ID,
  //         VERCEL_PROJECT_ID_STAGE: appProjectIdStage,
  //       });
  //     },
  //   },
  //   {
  //     label: "Setting up Google Cloud",
  //     run: async (spinner: ora.Ora) => {
  //       const googleProjectName = `${projectName} CMS Stage`;
  //       const idealProjectId = paramCase(googleProjectName);
  //       async function replaceTakenId(takenId: string) {
  //         spinner.stop();
  //         const { compromiseProjectId } = await prompts({
  //           type: "text",
  //           name: "compromiseProjectId",
  //           initial: takenId,
  //           message: "This Google Project id is taken. What should the id be?",
  //         });
  //         spinner.start();
  //         return compromiseProjectId;
  //       }
  //       const project = await googlecloud.setupProject(
  //         googleProjectName,
  //         idealProjectId,
  //         replaceTakenId
  //       );
  //       gcloudProjectIdStage = project.projectId as string;
  //       await extendDotEnv(path.join(destDir, "packages", "cms", ".env"), {
  //         GCLOUD_PROJECT_ID_STAGE: gcloudProjectIdStage,
  //       });
  //     },
  //   },
  //   {
  //     label: "Setting up Mongo DB",
  //     run: async () => {
  //       const password = passwd.generate();
  //       await mongo.createUser(projectHid, password);
  //       const srvAddress = await mongo.getConnectionString("Stage");

  //       cmsDatabaseUriStage = URI(srvAddress)
  //         .username(projectHid)
  //         .password(password)
  //         .pathname(projectHid)
  //         .query({ retryWrites: "true", w: "majority" })
  //         .toString();

  //       await extendDotEnv(path.join(destDir, "packages", "cms", ".env"), {
  //         DATABASE_URI_STAGE: cmsDatabaseUriStage,
  //       });
  //     },
  //   },
  //   {
  //     label: "Setting up Github",
  //     run: async (spinner) => {
  //       githubOriginUrl = await github.createRepo({
  //         name: projectHid,
  //         replaceTakenRepoName: makeReplaceTakenIdFn({
  //           spinner,
  //           resourceName: "repo name",
  //         }),
  //       });

  //       const { NPM_TOKEN, VERCEL_TOKEN, VERCEL_ORG_ID } = process.env;

  //       if (
  //         typeof NPM_TOKEN !== "string" ||
  //         typeof VERCEL_TOKEN !== "string" ||
  //         typeof VERCEL_ORG_ID !== "string"
  //       ) {
  //         throw new Error();
  //       }

  //       const GCLOUD_APP_YAML_BASE64_STAGE = await (async () => {
  //         const tpl = await fs.readFile(
  //           `${destDir}/packages/cms/app.stage.yml`,
  //           "utf8"
  //         );
  //         const yml = Mustache.render(tpl, { cmsDatabaseUriStage });
  //         return Buffer.from(yml).toString("base64");
  //       })();

  //       if (typeof process.env.GOOGLE_APPLICATION_CREDENTIALS !== "string") {
  //         throw new MissingEnvVarError();
  //       }

  //       const GCLOUD_SERVICE_ACCOUNT_JSON = await fs.readFile(
  //         process.env.GOOGLE_APPLICATION_CREDENTIALS as string,
  //         "utf8"
  //       );

  //       await github.addSecrets(projectHid, {
  //         NPM_TOKEN: NPM_TOKEN,
  //         VERCEL_TOKEN: VERCEL_TOKEN,
  //         VERCEL_ORG_ID: VERCEL_ORG_ID,
  //         VERCEL_APP_PROJECT_ID_STAGE: appProjectIdStage,
  //         VERCEL_UI_PROJECT_ID_STAGE: uiProjectIdStage,
  //         GCLOUD_PROJECT_ID_STAGE: gcloudProjectIdStage,
  //         GCLOUD_APP_YAML_BASE64_STAGE,
  //         GCLOUD_SERVICE_ACCOUNT_JSON,
  //       });
  //     },
  //   },

  //   {
  //     label: "Injecting template variables",
  //     run: () =>
  //       injectTemplateVars({
  //         destDir,
  //         projectName,
  //         projectHid,
  //         cmsDatabaseUriStage,
  //       }),
  //   },

  //   {
  //     label: "Renaming packages",
  //     run: () => renamePackages({ projectHid, destDir }),
  //   },
  //   {
  //     label: "Enabling env vars",
  //     run: () => enableEnvFiles({ destDir, projectHid }),
  //   },
  //   {
  //     label: "Installing and linking dependencies",
  //     run: () => installDeps({ destDir }),
  //   },
  //   {
  //     label: "Initialising Git",
  //     run: () => initialiseGit({ destDir, originUrl: githubOriginUrl }),
  //   },
  // ];

  const localSteps: Step[] = [
    {
      label: "creating work tree",
      run: () => fs.copy(templateDir, destDir),
    },

    {
      label: "adding .env files",
      run: async () => {
        const packages = ["cms", "ui", "app"];
        await Promise.all(
          packages.map((p) =>
            fs.copyFile(
              path.join(destDir, "packages", p, ".env.example"),
              path.join(destDir, "packages", p, ".env")
            )
          )
        );
      },
    },

    {
      label: "seeding cms",
      run: async () => {
        const seedProcess = execa("docker", [
          "exec",
          "-i",
          "mongo",
          "mongorestore",
          "--archive",
          "--nsFrom=ms.*",
          `--nsTo=${projectHid}.*`,
        ]);
        fs.createReadStream(path.join(__dirname, "..", "cms.data")).pipe(
          seedProcess.stdin as Writable
        );

        await seedProcess;

        await execa("docker", [
          "exec",
          "-i",
          "mongo",
          "mongo",
          projectHid,
          "--eval",
          `db.projects.updateOne({}, { $set: { name: "${projectName}"} })`,
        ]);
      },
    },

    {
      label: "injecting template variables",
      run: async () => {
        await injectTemplateVars({
          destDir,
          projectName,
          projectHid,
        });
      },
    },

    {
      label: "prefixing packages",
      run: async () => {
        const packages = ["tsconfig", "types", "cms", "ui", "app"];

        await Promise.all(
          packages.map((p) =>
            fs.move(
              path.join(destDir, "packages", p),
              path.join(destDir, "packages", `${projectHid}-${p}`)
            )
          )
        );
      },
    },

    {
      label: "enabling environment variables",
      run: async () => {
        const packages = ["cms", "ui", "app"];
        await Promise.all(
          packages.map((p) =>
            execa("direnv", ["allow"], {
              cwd: path.join(destDir, "packages", `${projectHid}-${p}`),
            })
          )
        );
      },
    },

    {
      label: "installing and linking dependencies",
      run: async () => {
        await execa("lerna", ["bootstrap"], { cwd: destDir });
      },
    },
  ];

  for (let step of localSteps) {
    let spinner = ora(step.label);
    spinner.start();
    try {
      await step.run(spinner);
    } catch (e) {
      spinner.fail();
      throw e;
    }
    spinner.succeed();
  }
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
