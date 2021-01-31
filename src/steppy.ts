import chalk from "chalk";
import ora, { Ora } from "ora";
import { format as formatDate } from "date-fns";
import boxen from "boxen";

export type Step<T> = {
  group?: string;
  title: string;
  run: (ctx: RunContext<T>, outputs: { [key: string]: any }) => Promise<any>;
};

export type RunContext<T> = {
  spinner: Ora;
} & T;

export async function run<T>(
  steps: Step<T>[],
  additionalContext: T
): Promise<{ [key: string]: any }> {
  let outputs = {};

  for (let step of steps) {
    let spinner = ora({
      prefixText: `${chalk.dim(`[${formatDate(new Date(), "HH:mm:ss")}]`)} ${
        step.title
      }`,
    });
    spinner.start();
    const result = await step
      .run({ spinner, ...additionalContext }, outputs)
      .catch((e) => {
        spinner.fail();
        throw e;
      });
    outputs = {
      ...outputs,
      [step.title]: result,
    };
    spinner.succeed();
  }

  return outputs;
}

export function head(message: string) {
  console.log(
    boxen(message, {
      borderStyle: "classic",
      margin: { left: 0, top: 1, right: 0, bottom: 1 },
      padding: { left: 1, top: 0, right: 1, bottom: 0 },
    })
  );
}
