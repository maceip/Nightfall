'use strict';

const { readFile, writeFile } = require('node:fs/promises');
const Module = require('node:module');
const vm = require('node:vm');
const {
  configureBytecodeRuntime,
  bytecodeDigest,
} = require('./desktop-bytecode-runtime.cjs');

async function compile() {
  const [entryPath, outputPath] = process.argv.slice(2);
  if (!entryPath || !outputPath) {
    throw new Error('Usage: node compile-desktop-bytecode.cjs <entry.cjs> <output.jsc>');
  }
  const runtime = configureBytecodeRuntime();
  if (!runtime.electron && process.env.NIGHTFALL_ALLOW_NODE_BYTECODE !== '1') {
    throw new Error('Nightfall desktop V8 bytecode must be compiled under ELECTRON_RUN_AS_NODE=1');
  }
  const source = await readFile(entryPath, 'utf8');
  const wrapped = Module.wrap(source.replace(/^#![^\r\n]*/, ''));
  const script = new vm.Script(wrapped, {
    filename: entryPath,
    importModuleDynamically: vm.constants.USE_MAIN_CONTEXT_DEFAULT_LOADER,
  });
  const cachedData = script.createCachedData();
  await writeFile(outputPath, cachedData);
  process.stdout.write(
    `${JSON.stringify({
      runtime,
      sourceLength: wrapped.length,
      sourceSha256: bytecodeDigest(Buffer.from(source)),
      bytecodeSha256: bytecodeDigest(cachedData),
      bytecodeBytes: cachedData.length,
    })}\n`,
  );
}

compile().catch((error) => {
  process.stderr.write(`${error?.stack ?? error}\n`);
  process.exitCode = 1;
});
