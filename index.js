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
      message: "Is this the correct project id?",
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

  await copyTemplate({ templateDir, destDir });
  await renamePackages({ projectHid, templateDir, destDir });
  await injectTemplateVars({ projectName, projectHid, destDir });
}

run().catch((e) => {
  console.log("\n");
  console.log(e);
  console.log("\n");
  process.exit(1);
});
