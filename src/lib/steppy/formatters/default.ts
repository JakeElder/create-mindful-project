import chalk, { ForegroundColor } from "chalk";
import ora from "ora";
import { format as dateFormat } from "date-fns";
import { Observable } from "rxjs";
import { StepDescriptor, Formatter } from "..";

function formatDate(date: Date) {
  return chalk.dim(`${dateFormat(date, "HH:mm:ss")}`);
}

function formatTitle(
  group: StepDescriptor["group"],
  title: StepDescriptor["title"]
) {
  if (typeof group === "string") {
    return `[${formatDate(new Date())}] ${formatGroup(group)} ${title}`;
  }
  return `[${formatDate(new Date())}] ${title}`;
}

function formatGroup(group: string) {
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

export default class DefaultFormatter implements Formatter {
  private spinner: ora.Ora | null = null;

  subscribe(observable: Observable<StepDescriptor>) {
    observable.subscribe({
      next: ({ title, group }) => {
        if (this.spinner !== null) {
          this.spinner.succeed();
        }
        this.spinner = ora({ prefixText: formatTitle(group, title) });
        this.spinner.start();
      },

      complete: () => {
        if (this.spinner !== null) {
          this.spinner.succeed();
        }
      },

      error: () => {
        this.spinner!.fail();
        this.spinner = null;
        this.log();
      },
    });
  }

  log(...data: any[]) {
    console.log(...data);
  }
}
