// Add the bookmarklet script and extension zip next to the built demo pages.
import { cpSync, readFileSync } from "node:fs";

const { version } = JSON.parse(readFileSync("package.json", "utf8"));
cpSync("dist/fracture-anywhere.js", "site/fracture-anywhere.js");
cpSync(`fracture-anything-${version}.zip`, "site/fracture-anything.zip");
console.log("Copied bookmarklet script and extension into site/");
