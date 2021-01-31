import chalk from "chalk";
import { Step } from "./steppy";
import * as vercel from "./vercel";

export type Context = { projectHid: string; domain: string };

const steps: Step<Context>[] = [];

steps.push({
  group: chalk.blue("[vercel]"),
  title: "creating ui project",
  run: async ({ projectHid, domain }, outputs) => {
    console.log("outputs", outputs);
    // const project = await vercel.createProject({
    //   name: `${projectHid}-ui-stage`,
    //   domain: `ui.stage.${domain}`,
    // });
    return Promise.resolve({ projectId: "5" });
    // return { projectId: project.id };
  },
});

steps.push({
  group: chalk.blue("[vercel]"),
  title: "doing next thing",
  run: async (_, outputs) => {
    console.log("outputs", outputs);
  },
});

export default steps;
