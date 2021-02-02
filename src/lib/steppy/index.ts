import chalk, { ForegroundColor } from "chalk";
import ora from "ora";
import { format as formatDate } from "date-fns";
import boxen from "boxen";
import { Subject, Observable } from "rxjs";

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
  caveat: {
    add: (caveatId: Caveat) => void;
    exists: (caveatId: Caveat) => boolean;
  };
} & AdditionalContext;

function formattedDate() {
  return chalk.dim(`${formatDate(new Date(), "HH:mm:ss")}`);
}

let caveatStore: string[] = [];

class Formatter {
  private spinner: ora.Ora | null = null;

  subscribe(observable: Observable<{ group?: string; title: string }>) {
    observable.subscribe({
      next: ({ title, group }) => {
        if (this.spinner !== null) {
          this.spinner.succeed();
        }
        this.spinner = ora({ prefixText: this.formatTitle(group, title) });
        this.spinner.start();
      },

      complete: () => {
        if (this.spinner !== null) {
          this.spinner.succeed();
        }
      },

      error: (e) => {
        this.spinner!.fail();
        this.spinner = null;
        throw e;
      },
    });
  }

  formatTitle(group: string | undefined, title: string) {
    if (typeof group === "string") {
      return `[${formattedDate()}] ${this.formatGroup(group)} ${title}`;
    }
    return `[${formattedDate()}] ${title}`;
  }

  formatGroup(group: string) {
    let color: typeof ForegroundColor | undefined;

    switch (group) {
      case "vercel":
        color = "magenta";
        break;
      case "github":
        color = "blue";
        break;
      case "google":
        color = "green";
        break;
      case "mongo":
        color = "yellow";
        break;
      case "local":
        color = "grey";
        break;
    }

    if (typeof color !== "undefined") {
      return chalk[color](`[${group}]`);
    }

    return `[${group}]`;
  }
}

export async function run<AdditionalContext, Outputs, Caveat extends string>(
  steps: Step<AdditionalContext, Outputs, Caveat>[],
  additionalContext: AdditionalContext
): Promise<NonVoid<Outputs>> {
  let outputs: Partial<NonVoid<Outputs>> = {};

  const ctx: RunContext<AdditionalContext, Caveat> = {
    caveat: {
      add: (id) => caveatStore.push(id),
      exists: (id) => caveatStore.includes(id),
    },
    ...additionalContext,
  };

  const subject = new Subject<{ group?: string; title: string }>();

  new Formatter().subscribe(subject);

  for (let step of steps) {
    subject.next({
      title: step.title as string,
      group: step.group,
    });

    try {
      const result = await step.run(
        ctx,
        (outputs as unknown) as NonVoid<Outputs>
      );
      if (typeof result !== "undefined") {
        outputs = { ...outputs, [step.title]: result };
      }
    } catch (e) {
      subject.error(new Error(e));
      subject.complete();
    }
  }

  subject.complete();

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
