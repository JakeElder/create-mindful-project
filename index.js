#!/usr/bin/env node

const Mustache = require("mustache");
const fs = require("fs-extra");
const prompts = require("prompts");
const { paramCase } = require("change-case");
const path = require("path");
const { lsrAsync } = require("lsr");
const { isBinaryFile } = require("isbinaryfile");
const { default: filterAsync } = require("node-filter-async");
const ora = require("ora");
const spawnAsync = require("@expo/spawn-async");

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
    ],
    {
      onCancel: () => {
        throw new PromptCancelledError();
      },
    }
  );
}

async function copyTemplate({ templateDir, destDir }) {
  await fs.copy(templateDir, destDir);
}

async function renamePackages({ destDir, projectHid }) {
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
        Mustache.render(c.toString(), { projectName, projectHid })
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

async function installDeps({ destDir }) {
  await spawnAsync("lerna", ["bootstrap"], { cwd: destDir });
}

async function seedCMS({ projectName, projectHid }) {
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

  seedStream.on("data", (data) => childStdin.write(data));
  seedStream.on("end", (data) => childStdin.end());

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

async function initialiseGit({ destDir }) {
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

async function run() {
  const { projectName, projectHid } = await getResponses();

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
  ];

  for (let step of steps) {
    let spinner = ora(step.label);
    spinner.start();
    try {
      await step.run();
    } catch (e) {
      spinner.fail();
      throw e;
    }
    spinner.succeed();
  }
}

run().catch((e) => {
  if (e instanceof PromptCancelledError) {
    console.log("Cancelling");
    process.exit(1);
  }
  console.log(e);
  process.exit(1);
});
