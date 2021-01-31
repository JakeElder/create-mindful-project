import chalk from "chalk";
import { Step } from "./steppy";
import * as vercel from "./vercel";

export type Context = { projectHid: string; domain: string };
export type Outputs = {
  "creating ui project": { projectId: string };
  "doing next thing": void;
};

const steps: Step<Context, Outputs>[] = [];

steps.push({
  group: chalk.blue("[vercel]"),
  title: "creating ui project",
  run: async ({ projectHid, domain }) => {
    const project = await vercel.createProject({
      name: `${projectHid}-ui-stage`,
      domain: `ui.stage.${domain}`,
    });
    return { projectId: "a" };
  },
});

steps.push({
  group: chalk.blue("[vercel]"),
  title: "doing next thing",
  run: async (ctx) => {
    console.log("outputs", ctx);
  },
});

export default steps;
