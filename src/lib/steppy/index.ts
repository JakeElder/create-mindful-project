import chalk from "chalk";
import boxen from "boxen";
import { Observable, Subject } from "rxjs";
import DefaultFormatter from "./formatters/default";

export type StepDescriptor = {
  group?: string;
  title: string;
};

export interface Formatter {
  subscribe(observable: Observable<StepDescriptor>): void;
  log(...data: any[]): void;
}

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

let caveatStore: string[] = [];

export async function run<AdditionalContext, Outputs, Caveat extends string>(
  steps: Step<AdditionalContext, Outputs, Caveat>[],
  additionalContext: AdditionalContext,
  options?: { formatter?: Formatter }
): Promise<NonVoid<Outputs>> {
  let outputs: Partial<NonVoid<Outputs>> = {};

  const ctx: RunContext<AdditionalContext, Caveat> = {
    caveat: {
      add: (id) => caveatStore.push(id),
      exists: (id) => caveatStore.includes(id),
    },
    ...additionalContext,
  };

  const formatter = options?.formatter || new DefaultFormatter();
  const subject = new Subject<StepDescriptor>();
  formatter.subscribe(subject);

  for (let step of steps) {
    subject.next({
      title: step.title as string,
      group: step.group,
    });

    const result = await step
      .run(ctx, (outputs as unknown) as NonVoid<Outputs>)
      .catch((e) => {
        subject.error(new Error(e.message));
        subject.complete();
        throw e;
      });

    if (typeof result !== "undefined") {
      outputs = { ...outputs, [step.title]: result };
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
