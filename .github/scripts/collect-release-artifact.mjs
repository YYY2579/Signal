#!/usr/bin/env node

import { copyFile, mkdir, readdir } from 'node:fs/promises';
import { dirname, resolve } from 'node:path';

function parseArguments(argv) {
  const values = new Map();

  for (let index = 0; index < argv.length; index += 2) {
    const key = argv[index];
    const value = argv[index + 1];
    if (!key?.startsWith('--') || value === undefined) {
      throw new Error('Expected --bundle-dir, --extension, and --output arguments.');
    }
    values.set(key.slice(2), value);
  }

  for (const key of ['bundle-dir', 'extension', 'output']) {
    if (!values.has(key)) {
      throw new Error(`Missing required --${key} argument.`);
    }
  }

  return values;
}

async function listFiles(directory) {
  const entries = await readdir(directory, { withFileTypes: true });
  const nested = await Promise.all(
    entries.map(async (entry) => {
      const path = resolve(directory, entry.name);
      return entry.isDirectory() ? listFiles(path) : [path];
    }),
  );

  return nested.flat();
}

try {
  const args = parseArguments(process.argv.slice(2));
  const bundleDirectory = resolve(args.get('bundle-dir'));
  const output = resolve(args.get('output'));
  const extension = args.get('extension').toLowerCase();
  const matches = (await listFiles(bundleDirectory)).filter((path) =>
    path.toLowerCase().endsWith(extension),
  );

  if (matches.length !== 1) {
    throw new Error(
      `Expected exactly one ${args.get('extension')} artifact in ${bundleDirectory}, found ${matches.length}: ${matches.join(', ')}`,
    );
  }

  await mkdir(dirname(output), { recursive: true });
  await copyFile(matches[0], output);
  console.log(`Collected ${matches[0]} as ${output}`);
} catch (error) {
  console.error(error instanceof Error ? error.message : error);
  process.exitCode = 1;
}
