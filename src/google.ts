import { google } from "googleapis";
import PrettyError from "pretty-error";

const pe = new PrettyError();

async function main() {}

main().catch((e) => {
  console.log(pe.render(e));
  process.exit(1);
});
