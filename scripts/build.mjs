#!/usr/bin/env node
// Bundles the script of each experiment (src/<name>/main.ts) into
// public/<name>/main.js. Everything else in public/ is committed as it is.
import { build } from "esbuild";

const EXPERIMENTS = ["prf"];

const results = await Promise.all(
  EXPERIMENTS.map((name) =>
    build({
      entryPoints: [`src/${name}/main.ts`],
      outfile: `public/${name}/main.js`,
      bundle: true,
      format: "esm",
      target: "es2022",
      minify: true,
      legalComments: "none",
      metafile: true,
    }),
  ),
);
for (const result of results) {
  for (const [file, { bytes }] of Object.entries(result.metafile.outputs)) {
    console.log(`${file}: ${(bytes / 1024).toFixed(1)} kB`);
  }
}
