#!/usr/bin/env node

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
import { cloudresourcemanager_v1, google } from "googleapis";

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
}: {
  destDir: string;
  projectName: string;
  projectHid: string;
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
        Mustache.render(c.toString(), { projectName, projectHid })
      );
    })
  );
}

async function addEnvFiles({
  projectHid,
  destDir,
}: {
  projectHid: string;
  destDir: string;
}) {
  const packages = [
    `${projectHid}-cms`,
    `${projectHid}-ui`,
    `${projectHid}-app`,
  ];

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
  const seedPromise = spawnAsync(
    "docker",
    [
      "exec",
      "-i",
      "mongo",
      "mongorestore",
      "--archive",
      "--nsFrom=ms.*",
      `--nsTo=${projectHid}.*`,
    ],
    { cwd: path.dirname(__filename) }
  );

  const { stdin: childStdin } = seedPromise.child;

  const seedStream = fs.createReadStream(
    path.join(path.dirname(__filename), "cms.data")
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

async function vercel(
  method: "POST" | "GET",
  endpoint: string,
  params: { [key: string]: any }
) {
  const r = await fetch(`https://api.vercel.com${endpoint}`, {
    method,
    ...(params && { body: JSON.stringify(params) }),
    headers: {
      ...(method === "POST" && { "Content-Type": "application/json" }),
      Authorization: `Bearer ${process.env.VERCEL_TOKEN}`,
    },
  });

  if (!r.ok) {
    console.log(await r.json());
    throw new Error("Failed Vercel API call");
  }

  return r.json();
}

type VercelEnvVariable = {
  type: "plain" | "secret" | "system";
  key: string;
  value: string;
  target: ("development" | "preview" | "production")[];
};

async function setupVercelProject({
  name,
  domain,
  env = [],
}: {
  name: string;
  domain: string;
  env?: VercelEnvVariable[];
}) {
  const project = await vercel("POST", "/v6/projects", { name });
  await vercel("POST", `/v1/projects/${project.id}/alias`, {
    domain,
  });

  if (env.length > 0) {
    await Promise.all(
      env.map((e) => vercel("POST", `/v6/projects/${project.id}/env`, e))
    );
  }

  return project;
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

async function getGoogleAuth(scopes: string[]) {
  const auth = new google.auth.GoogleAuth({ scopes });
  return await auth.getClient();
}

async function createGCloudProject({
  name,
  projectId,
}: {
  name: string;
  projectId: string;
}) {
  const crm = google.cloudresourcemanager("v1");
  await crm.projects.create({
    requestBody: { name, projectId },
    auth: await getGoogleAuth([
      "https://www.googleapis.com/auth/cloud-platform",
    ]),
  });
  return crm.projects.get({
    projectId,
    auth: await getGoogleAuth([
      "https://www.googleapis.com/auth/cloud-platform",
    ]),
  });
}

async function createGCloudApp({
  projectNumber,
  projectId,
}: {
  projectNumber: string;
  projectId: string;
}) {
  const appengine = google.appengine("v1");
  const serviceusage = google.serviceusage("v1");
  await serviceusage.services.enable({
    name: `projects/${projectNumber}/services/appengine.googleapis.com`,
    auth: await getGoogleAuth([
      "https://www.googleapis.com/auth/cloud-platform",
      "https://www.googleapis.com/auth/service.management",
    ]),
  });
  console.log(projectId);
  const r = await appengine.apps.create({
    requestBody: {
      id: projectId,
      locationId: "asia-south1",
    },
    auth: await getGoogleAuth([
      "https://www.googleapis.com/auth/cloud-platform",
    ]),
  });
  console.log(r);
}

async function run() {
  const { projectName, projectHid, domain } = await getResponses();

  let uiProjectIdStage: string;
  let appProjectIdStage: string;

  const templateDir = path.join(path.dirname(__filename), "template");
  const destDir = path.join(process.cwd(), projectHid);

  const steps = [
    {
      label: "Copying template files",
      run: () => copyTemplate({ templateDir, destDir }),
    },
    {
      label: "Renaming packages",
      run: () => renamePackages({ projectHid, destDir }),
    },
    {
      label: "Injecting template variables",
      run: () => injectTemplateVars({ projectName, projectHid, destDir }),
    },
    {
      label: "Adding .env files",
      run: () => addEnvFiles({ projectHid, destDir }),
    },
    {
      label: "Initialising CMS",
      run: () => seedCMS({ projectName, projectHid }),
    },
    {
      label: "Installing and linking dependencies",
      run: () => installDeps({ destDir }),
    },
    {
      label: "Initialising Git",
      run: () => initialiseGit({ destDir }),
    },
    {
      label: "Setting up Vercel UI project",
      run: async () => {
        const project = await setupVercelProject({
          name: `${projectHid}-ui-stage`,
          domain: `ui.stage.${domain}`,
        });
        uiProjectIdStage = project.id;
      },
    },
    {
      label: "Setting UI env variables",
      run: () => {
        return extendDotEnv(
          path.join(destDir, "packages", `${projectHid}-ui`, ".env"),
          {
            VERCEL_TOKEN: process.env.VERCEL_TOKEN,
            VERCEL_ORG_ID: process.env.VERCEL_ORG_ID,
            VERCEL_PROJECT_ID_STAGE: uiProjectIdStage,
          }
        );
      },
    },
    {
      label: "Setting up Vercel App project",
      run: async () => {
        const project = await setupVercelProject({
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
      run: () => {
        return extendDotEnv(
          path.join(destDir, "packages", `${projectHid}-app`, ".env"),
          {
            VERCEL_TOKEN: process.env.VERCEL_TOKEN,
            VERCEL_ORG_ID: process.env.VERCEL_ORG_ID,
            VERCEL_PROJECT_ID_STAGE: appProjectIdStage,
          }
        );
      },
    },
    {
      label: "Setting up Google Cloud",
      run: async (spinner: ora.Ora) => {
        const googleProjectName = `${projectName} CMS Stage`;
        const idealProjectId = paramCase(googleProjectName);
        async function setupProjectWithIdCheck(
          projectId: string
        ): Promise<cloudresourcemanager_v1.Schema$Project> {
          try {
            const project = await createGCloudProject({
              name: googleProjectName,
              projectId,
            });
            return project.data;
          } catch (e) {
            if (e.response?.data.error.status !== "ALREADY_EXISTS") {
              throw e;
            }
            spinner.stop();
            const { compromiseProjectId } = await prompts([
              {
                type: "text",
                name: "compromiseProjectId",
                initial: projectId,
                message:
                  "This Google Project id is taken. What should the id be?",
              },
            ]);
            spinner.start();
            return setupProjectWithIdCheck(compromiseProjectId);
          }
        }
        const { projectNumber, projectId } = await setupProjectWithIdCheck(
          idealProjectId
        );
        await createGCloudApp({ projectNumber, projectId } as {
          projectNumber: string;
          projectId: string;
        });
      },
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
  console.log(e);
  process.exit(1);
});
