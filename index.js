#!/usr/bin/env node

const Mustache = require("mustache");
const fs = require("fs-extra");
const prompts = require("prompts");
const { paramCase } = require("change-case");
const path = require("path");
const { lsrAsync } = require("lsr");
const { isBinaryFile } = require("isbinaryfile");
const filterAsync = require("node-filter-async").default;
const debug = require("debug")("create-mindful-project");
const ora = require("ora");
const spawnAsync = require("@expo/spawn-async");

const DEBUG_VALUES = {
  projectName: "Mindful Studio",
  projectHid: "mindful-studio",
};

async function getResponses() {
  if (debug.enabled) {
    return Promise.resolve(DEBUG_VALUES);
  }

  return prompts([
    {
      type: "text",
      name: "projectName",
      initial: "Mindful Studio",
      message: "What is the name of the Project?",
    },
    {
      type: "text",
      name: "projectHid",
      initial: (_, values) => {
        return paramCase(values.projectName);
      },
      message: "Is this the correct project hid?",
    },
  ]);
}

async function copyTemplate({ templateDir, destDir }) {
  await fs.copy(templateDir, destDir);
}

async function renamePackages({ templateDir, destDir, projectHid }) {
  const packages = ["tsconfig", "types", "cms", "ui", "app"];

  await Promise.all(
    packages.map((package) =>
      fs.move(
        path.join(destDir, "packages", package),
        path.join(destDir, "packages", `${projectHid}-${package}`)
      )
    )
  );
}

async function injectTemplateVars({ destDir, projectName, projectHid }) {
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
        Mustache.render(c.toString(), { projectName })
      );
    })
  );
}

async function addEnvFiles({ projectHid, destDir }) {
  const packages = [
    `${projectHid}-cms`,
    `${projectHid}-ui`,
    `${projectHid}-app`,
  ];

  await Promise.all(
    packages.map((package) =>
      fs.copyFile(
        path.join(destDir, "packages", package, ".env.example"),
        path.join(destDir, "packages", package, ".env")
      )
    )
  );

  await Promise.all(
    packages.map((package) =>
      spawnAsync("direnv", ["allow"], {
        cwd: path.join(destDir, "packages", package),
      })
    )
  );
}

async function seedCMS({ projectName, projectId }) {
  `
  docker exec -i mongo sh -c ' \\
    mongorestore \\
    -d ${projectId} \\
    --archive' < seed.data
  `;

  `
  docker exec -i mongo \\
    mongo ${{ projectId }} --eval \\
    'db.projects.updateOne({}, { $set: { name: "${projectName}" } })'
  `;
}

async function run() {
  if (debug.enabled) {
    debug("Clearing directory");
    await fs.remove(path.join(process.cwd(), DEBUG_VALUES.projectHid));
  }

  const { projectName, projectHid } = await getResponses();

  const templateDir = path.join(path.dirname(__filename), "template");
  const destDir = path.join(process.cwd(), projectHid);

  if (!fs.lstatSync(templateDir).isDirectory()) {
    console.log("Template directory does not exist");
    return;
  }

  const steps = {
    copyTemplate: {
      spinner: ora("Copying template files"),
    },
    renamePackages: {
      spinner: ora("Renaming Packages"),
    },
    injectTemplateVars: {
      spinner: ora("Injecting template variables"),
    },
    addEnvFiles: {
      spinner: ora("Adding .env files"),
    },
  };

  steps.copyTemplate.spinner.start();
  await copyTemplate({ templateDir, destDir });
  steps.copyTemplate.spinner.succeed();

  steps.renamePackages.spinner.start();
  await renamePackages({ projectHid, templateDir, destDir });
  steps.renamePackages.spinner.succeed();

  steps.injectTemplateVars.spinner.start();
  await injectTemplateVars({ projectName, projectHid, destDir });
  steps.injectTemplateVars.spinner.succeed();

  steps.addEnvFiles.spinner.start();
  await addEnvFiles({ projectHid, destDir });
  steps.addEnvFiles.spinner.succeed();
}

run().catch((e) => {
  console.log(e);
  process.exit(1);
});
