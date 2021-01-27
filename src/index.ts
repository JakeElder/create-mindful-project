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
import spawnAsync from "@expo/spawn-async";
import fetch from "node-fetch";
import dotenv from "dotenv";
import dotenvStringify from "dotenv-stringify";
import PrettyError from "pretty-error";
import * as googlecloud from "./google-cloud";
import * as vercel from "./vercel";

class PromptCancelledError extends Error {}

async function getResponses() {
  return prompts(
    [
      {
        type: "text",
        name: "projectName",
        initial: "Mindful Studio",
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

async function copyTemplate({
  templateDir,
  destDir,
}: {
  templateDir: string;
  destDir: string;
}) {
  await fs.copy(templateDir, destDir);
}

async function renamePackages({
  destDir,
  projectHid,
}: {
  destDir: string;
  projectHid: string;
}) {
  const packages = ["tsconfig", "types", "cms", "ui", "app"];

  await Promise.all(
    packages.map((p) =>
      fs.move(
        path.join(destDir, "packages", p),
        path.join(destDir, "packages", `${projectHid}-${p}`)
      )
    )
  );
}

async function injectTemplateVars({
  destDir,
  projectName,
  projectHid,
  cmsDatabaseUri,
}: {
  destDir: string;
  projectName: string;
  projectHid: string;
  cmsDatabaseUri: string;
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
          cmsDatabaseUri,
        })
      );
    })
  );
}

async function addEnvFiles({ destDir }: { destDir: string }) {
  const packages = ["cms", "ui", "app"];

  await Promise.all(
    packages.map((p) =>
      fs.copyFile(
        path.join(destDir, "packages", p, ".env.example"),
        path.join(destDir, "packages", p, ".env")
      )
    )
  );

  await Promise.all(
    packages.map((p) =>
      spawnAsync("direnv", ["allow"], {
        cwd: path.join(destDir, "packages", p),
      })
    )
  );
}

async function installDeps({ destDir }: { destDir: string }) {
  await spawnAsync("lerna", ["bootstrap"], { cwd: destDir });
}

async function seedCMS({
  projectName,
  projectHid,
}: {
  projectName: string;
  projectHid: string;
}) {
  const seedPromise = spawnAsync("docker", [
    "exec",
    "-i",
    "mongo",
    "mongorestore",
    "--archive",
    "--nsFrom=ms.*",
    `--nsTo=${projectHid}.*`,
  ]);

  const { stdin: childStdin } = seedPromise.child;

  const seedStream = fs.createReadStream(
    path.join(path.dirname(__filename), "..", "cms.data")
  );

  seedStream.on("data", (data) => childStdin!.write(data));
  seedStream.on("end", () => childStdin!.end());

  await seedPromise;

  await spawnAsync("docker", [
    "exec",
    "-i",
    "mongo",
    "mongo",
    projectHid,
    "--eval",
    `db.projects.updateOne({}, { $set: { name: "${projectName}"} })`,
  ]);
}

async function initialiseGit({ destDir }: { destDir: string }) {
  await spawnAsync("git", ["init"], {
    cwd: destDir,
  });
  await spawnAsync("git", ["add", "--all"], {
    cwd: destDir,
  });
  await spawnAsync("git", ["commit", "-m", "chore: initial commit"], {
    cwd: destDir,
  });
  await spawnAsync("git", ["branch", "--move", "main"], {
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

type Step = {
  label: string;
  run: (spinner: ora.Ora) => Promise<void>;
  skip?: boolean;
  isolate?: boolean;
};

async function run() {
  const { projectName, projectHid, domain } = await getResponses();

  let uiProjectIdStage: string;
  let appProjectIdStage: string;
  let gcloudProjectIdStage: string;

  const templateDir = path.join(path.dirname(__filename), "..", "template");
  const destDir = path.join(process.cwd(), projectHid);

  const steps: Step[] = [
    {
      label: "Copying template files",
      run: () => copyTemplate({ templateDir, destDir }),
    },
    {
      label: "Adding .env files",
      run: () => addEnvFiles({ destDir }),
    },
    {
      label: "Initialising CMS",
      run: () => seedCMS({ projectName, projectHid }),
    },
    {
      label: "Setting up Vercel UI project",
      run: async () => {
        const project = await vercel.createProject({
          name: `${projectHid}-ui-stage`,
          domain: `ui.stage.${domain}`,
        });
        uiProjectIdStage = project.id;
      },
    },
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
          domain: `stage.${domain}`,
          env: [
            {
              type: "plain",
              key: "GRAPHQL_URL",
              value: `https://cms.stage.${domain}/graphql`,
              target: ["preview", "production"],
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
      },
    },
    {
      label: "Setting App env variables",
      run: async () => {
        await extendDotEnv(path.join(destDir, "packages", "cms", ".env"), {
          GCLOUD_PROJECT_ID_STAGE: gcloudProjectIdStage,
        });
      },
    },
    {
      label: "Injecting template variables",
      run: () =>
        injectTemplateVars({
          projectName,
          projectHid,
          destDir,
          cmsDatabaseUri: process.env.CMS_DATABASE_URI as string,
        }),
    },
    {
      label: "Renaming packages",
      run: () => renamePackages({ projectHid, destDir }),
    },
    {
      label: "Installing and linking dependencies",
      run: () => installDeps({ destDir }),
    },
    {
      label: "Initialising Git",
      run: () => initialiseGit({ destDir }),
    },
  ];

  for (let step of steps) {
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
