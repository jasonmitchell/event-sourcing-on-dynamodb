import * as fs from 'fs';
import * as path from 'path';
import * as esbuild from 'esbuild';
import { fileURLToPath } from 'url';

const buildDirectories = process.argv.slice(2);

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

const findEntryPointsInDirectory = (dir, entryPointFileNamePatterns) => {
  const entryPoints = [];

  const directoryContents = fs.readdirSync(dir, { withFileTypes: true });
  directoryContents.forEach(entry => {
    if (entry.isDirectory()) {
      const entryPointsUnderDir = findEntryPointsInDirectory(`${dir}/${entry.name}`, entryPointFileNamePatterns);
      entryPoints.push(...entryPointsUnderDir);
    } else {
      if (entryPointFileNamePatterns.find(pattern => entry.name.match(pattern) !== null)) {
        entryPoints.push(`${dir}/${entry.name}`);
      }
    }
  });

  return entryPoints;
};

for (const dir of buildDirectories) {
  const rootDir = path.join(__dirname, `../src/${dir}`);
  const entryPoints = findEntryPointsInDirectory(rootDir, [/^index\.ts$/i, /.+\.lambda.ts$/i]);

  const result = await esbuild.build({
    entryPoints,
    minify: false,
    bundle: true,
    treeShaking: true,
    sourcemap: false,
    external: ['@aws-sdk/*'],
    outdir: path.join(__dirname, `../dist/${dir}`),
    outbase: rootDir,
    platform: 'node'
  });

  if (result.errors.length > 0) {
    console.error(result.errors);
    process.exit(1);
  }
}
