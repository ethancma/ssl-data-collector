import { readdirSync, readFileSync, statSync } from "node:fs";
import { resolve } from "node:path";

const secret = process.env.SUPABASE_SECRET_KEY;
const directories = process.argv.slice(2);
if (!secret || secret.length < 16 || directories.length === 0) {
  throw new Error("Provide SUPABASE_SECRET_KEY and client output directories to scan.");
}

let scannedFiles = 0;
function scan(directory) {
  for (const entry of readdirSync(directory, { withFileTypes: true })) {
    const path = resolve(directory, entry.name);
    if (entry.isDirectory()) {
      scan(path);
    } else if (entry.isFile()) {
      if (readFileSync(path).includes(Buffer.from(secret))) {
        throw new Error(`Server secret found in client output: ${path}`);
      }
      scannedFiles += 1;
    } else {
      throw new Error(`Unexpected non-file entry in client output: ${path}`);
    }
  }
}

for (const directory of directories) {
  if (!statSync(directory).isDirectory()) {
    throw new Error(`Expected a client output directory: ${directory}`);
  }
  scan(resolve(directory));
}
if (scannedFiles === 0) throw new Error("No client files were scanned.");
console.log(`Checked ${scannedFiles} client files; server secret was not found.`);
