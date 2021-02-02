import fs from "fs-extra";
import path from "path";
import execa from "execa";
import { Writable } from "stream";

import { Caveat } from "../create-mindful-project";

import * as template from "../lib/template";
import * as git from "../lib/git";
import { Step } from "../lib/steppy";

export type Context = {
  projectHid: string;
  projectName: string;
  templateDir: string;
  destDir: string;
};

export type Outputs = {
  "creating work tree": void;
  "adding default .env files": void;
  "seeding cms database": void;
  "injecting template variables": void;
  "prefixing packages": void;
  "enabling environment variables": void;
  "initialising git": void;
};

function isWritable(v: any): v is Writable {
  return v instanceof require("events") && typeof v.read === "function";
}

const steps: Step<Context, Outputs, Caveat>[] = [];

steps.push({
  group: "local",
  title: "creating work tree",
  run: async ({ templateDir, destDir }) => {
    await fs.copy(templateDir, destDir);
  },
});

steps.push({
  group: "local",
  title: "adding default .env files",
  run: async ({ destDir }) => {
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
});

steps.push({
  group: "local",
  title: "seeding cms database",
  run: async ({ projectHid, projectName }) => {
    const seedProcess = execa("docker", [
      "exec",
      "-i",
      "mongo",
      "mongorestore",
      "--archive",
      "--nsFrom=ms.*",
      `--nsTo=${projectHid}.*`,
    ]);

    if (!isWritable(seedProcess.stdin)) {
      throw new Error();
    }

    const seedFile = path.join(__dirname, "..", "..", "cms.data");
    fs.createReadStream(seedFile).pipe(seedProcess.stdin);

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
});

steps.push({
  group: "local",
  title: "injecting template variables",
  run: async ({ destDir, projectName, projectHid }) => {
    await template.directory(destDir, { projectName, projectHid });
  },
});

steps.push({
  group: "local",
  title: "prefixing packages",
  run: async ({ destDir, projectHid }) => {
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
});

steps.push({
  group: "local",
  title: "enabling environment variables",
  run: async ({ destDir, projectHid }) => {
    const packages = ["cms", "ui", "app"];
    await Promise.all(
      packages.map((p) =>
        execa("direnv", ["allow"], {
          cwd: path.join(destDir, "packages", `${projectHid}-${p}`),
        })
      )
    );
  },
});

steps.push({
  group: "local",
  title: "initialising git",
  run: async ({ destDir }) => {
    git.cd(destDir);
    await git.init();
    await git.add("--all");
    await git.commit("-m", "chore: initial commit [skip ci]");
    await git.branch("--move", "main");
    await git.checkout("-b", "develop");
  },
});

export { steps };
