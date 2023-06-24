import * as fs from 'fs';
import * as path from 'path';
import * as esbuild from 'esbuild';
import { fileURLToPath } from 'url';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

const findEntryPointsInDirectory = (dir, entryPointFileName) => {
  const entryPoints = [];

  const directoryContents = fs.readdirSync(dir, { withFileTypes: true });
  directoryContents.forEach(entry => {
    if (entry.isDirectory()) {
      const entryPointsUnderDir = findEntryPointsInDirectory(`${dir}/${entry.name}`, entryPointFileName);
      entryPoints.push(...entryPointsUnderDir);
    } else if (entry.name == entryPointFileName) {
      entryPoints.push(`${dir}/${entry.name}`);
    }
  });

  return entryPoints;
};

const rootDir = path.join(__dirname, '../src/api');
const entryPoints = findEntryPointsInDirectory(rootDir, 'index.ts');

await esbuild.build({
  entryPoints,
  minify: false,
  bundle: true,
  treeShaking: true,
  sourcemap: false,
  external: ['@aws-sdk/client-dynamodb'],
  outdir: path.join(__dirname, '../dist/api'),
  outbase: rootDir,
  platform: 'node'
});
