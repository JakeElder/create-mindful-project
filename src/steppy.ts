import chalk from "chalk";
import ora, { Ora } from "ora";
import { format as formatDate } from "date-fns";
import boxen from "boxen";

type NonVoid<T> = { [P in keyof T as T[P] extends void ? never : P]: T[P] };

export type Step<AdditionalContext, Outputs, Caveat> = {
  [K in keyof Outputs]: {
    group?: string;
    title: K;
    run: (
      ctx: RunContext<AdditionalContext, Caveat>,
      outputs: NonVoid<Outputs>
    ) => Promise<Outputs[K]>;
  };
}[keyof Outputs];

export type RunContext<AdditionalContext, Caveat> = {
  spinner: Ora;
  caveat: {
    add: (caveatId: Caveat) => void;
    exists: (caveatId: Caveat) => boolean;
  };
} & AdditionalContext;

function formattedDate() {
  return chalk.dim(`${formatDate(new Date(), "HH:mm:ss")}`);
}

function formatTitle({
  group,
  title,
  formatGroup,
}: {
  group?: string;
  title: string;
  formatGroup: (group: string) => string;
}) {
  if (typeof group === "string") {
    return `[${formattedDate()}] ${formatGroup(group)} ${title}`;
  }
  return `[${formattedDate()}] ${title}`;
}

let caveatStore: string[] = [];

export async function run<AdditionalContext, Outputs, Caveat extends string>(
  steps: Step<AdditionalContext, Outputs, Caveat>[],
  additionalContext: AdditionalContext,
  options?: {
    formatGroup?: (group: string) => string;
  }
): Promise<NonVoid<Outputs>> {
  let outputs: Partial<Outputs> = {};

  const formatGroup = options?.formatGroup || ((g) => `[${g}]`);

  for (let step of steps) {
    let spinner = ora({
      prefixText: formatTitle({
        group: step.group,
        title: step.title as string,
        formatGroup,
      }),
    }).start();

    const result = await step
      .run(
        {
          spinner,
          caveat: {
            add: (id) => caveatStore.push(id),
            exists: (id) => caveatStore.includes(id),
          },
          ...additionalContext,
        },
        (outputs as unknown) as NonVoid<Outputs>
      )
      .catch((e) => {
        spinner.fail();
        console.log();
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
    chalk.white(
      boxen(message, {
        borderStyle: "classic",
        margin: { left: 0, top: 1, right: 0, bottom: 1 },
        padding: { left: 1, top: 0, right: 1, bottom: 0 },
      })
    )
  );
}

export function caveats() {
  return caveatStore;
}
