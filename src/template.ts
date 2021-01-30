import fs from "fs-extra";
import { lsrAsync } from "lsr";
import filterAsync from "node-filter-async";
import { isBinaryFile } from "isbinaryfile";
import Mustache from "mustache";

export async function directory(dir: string, vars: { [key: string]: any }) {
  // Get recursive template directory listings
  const files = await lsrAsync(dir);

  // Filter out directories and binary files
  const nonBinaryFiles = await filterAsync(files, async (file) => {
    if (file.isDirectory()) {
      return Promise.resolve(false);
    }
    return !(await isBinaryFile(file.fullPath));
  });

  // Inject template variables and rewrite to disk
  await Promise.all(
    nonBinaryFiles.map(async (file) => {
      const c = await fs.readFile(file.fullPath);
      await fs.writeFile(file.fullPath, Mustache.render(c.toString(), vars));
    })
  );
}
