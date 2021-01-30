import fs from "fs-extra";
import path from "path";
import execa from "execa";
import { Writable } from "stream";
import * as template from "./template";
import * as git from "./git";
import { Step } from "./steppy";

export type LocalStepContext = {
  projectHid: string;
  projectName: string;
  templateDir: string;
  destDir: string;
};

const steps: Step<LocalStepContext>[] = [];

steps.push({
  title: "creating work tree",
  run: ({ templateDir, destDir }) => fs.copy(templateDir, destDir),
});

steps.push({
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
});

steps.push({
  title: "injecting template variables",
  run: async ({ destDir, projectName, projectHid }) => {
    await template.directory(destDir, {
      projectName,
      projectHid,
    });
  },
});

steps.push({
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

export default steps;
