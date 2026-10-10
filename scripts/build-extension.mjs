// Assemble dist-extension/ from extension/ and the anywhere bundle; zip it when `zip` exists.
import { execFileSync } from "node:child_process";
import {
  cpSync,
  mkdirSync,
  readFileSync,
  rmSync,
  writeFileSync,
} from "node:fs";

const { version } = JSON.parse(readFileSync("package.json", "utf8"));
const out = "dist-extension";
rmSync(out, { recursive: true, force: true });
mkdirSync(out);
cpSync("extension", out, { recursive: true });
cpSync("dist/fracture-anywhere.js", `${out}/fracture-anywhere.js`);
const manifest = JSON.parse(readFileSync(`${out}/manifest.json`, "utf8"));
manifest.version = version;
writeFileSync(`${out}/manifest.json`, `${JSON.stringify(manifest, null, 2)}\n`);
try {
  execFileSync("zip", ["-qr", `../fracture-anything-${version}.zip`, "."], {
    cwd: out,
  });
  console.log(`Built ${out}/ and fracture-anything-${version}.zip`);
} catch {
  console.log(`Built ${out}/ (zip not available)`);
}
