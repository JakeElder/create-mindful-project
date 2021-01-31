import chalk from "chalk";
import ora, { Ora } from "ora";
import { format as formatDate } from "date-fns";
import boxen from "boxen";

type NonVoid<T> = { [P in keyof T as T[P] extends void ? never : P]: T[P] };

export type Step<AdditionalContext, Outputs> = {
  [K in keyof Outputs]: {
    group?: string;
    title: K;
    run: (ctx: RunContext<AdditionalContext>) => Promise<Outputs[K]>;
  };
}[keyof Outputs];

export type RunContext<AdditionalContext> = {
  spinner: Ora;
} & AdditionalContext;

function formattedDate() {
  return chalk.dim(`${formatDate(new Date(), "HH:mm:ss")}`);
}

export async function run<AdditionalContext, Outputs>(
  steps: Step<AdditionalContext, Outputs>[],
  additionalContext: AdditionalContext
): Promise<NonVoid<Outputs>> {
  let outputs: Partial<Outputs> = {};

  for (let step of steps) {
    let spinner = ora({
      prefixText: `[${formattedDate()}] ${step.title}`,
    }).start();

    const result = await step
      .run({ spinner, ...additionalContext })
      .catch((e) => {
        spinner.fail();
        throw e;
      });

    if (typeof result !== "undefined") {
      outputs = { ...outputs, [step.title]: result };
    }

    spinner.succeed();
  }

  return (outputs as unknown) as NonVoid<Outputs>;
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
