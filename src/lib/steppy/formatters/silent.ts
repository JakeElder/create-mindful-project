import { Observable } from "rxjs";

import { Formatter, StepDescriptor } from "..";

export default class SilentFormatter implements Formatter {
  public output: any[] = [];

  subscribe(o: Observable<StepDescriptor>) {
    o.subscribe({
      next: ({ title }: { title: string }) => {
        this.output.push(title);
      },
    });
  }

  log(...m: any[]) {
    this.output.push(...m);
  }
}
