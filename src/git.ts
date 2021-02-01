import execa from "execa";

let cwd: string;

function makeGitFn(command: string) {
  return function (...args: string[]) {
    return execa("git", [command, ...args], { cwd });
  };
}

export function cd(dir: string) {
  cwd = dir;
}

export const init = makeGitFn("init");
export const add = makeGitFn("add");
export const commit = makeGitFn("commit");
export const branch = makeGitFn("branch");
export const checkout = makeGitFn("checkout");
export const remote = makeGitFn("remote");
export const push = makeGitFn("push");
