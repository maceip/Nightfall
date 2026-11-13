'use strict';

const v8 = require('node:v8');
const vm = require('node:vm');
const { createHash } = require('node:crypto');
const { readFile } = require('node:fs/promises');
const { basename, dirname, join } = require('node:path');

function configureBytecodeRuntime() {
  v8.setFlagsFromString('--no-lazy --no-flush-bytecode');
  return {
    electron: process.versions.electron ?? null,
    node: process.versions.node,
    v8: process.versions.v8,
    platform: process.platform,
    arch: process.arch,
    cachedDataVersionTag: v8.cachedDataVersionTag(),
  };
}

function bytecodeDigest(buffer) {
  return createHash('sha256').update(buffer).digest('hex');
}

async function loadBytecode(metadata, targetModule, targetRequire) {
  const runtime = configureBytecodeRuntime();
  if (JSON.stringify(runtime) !== JSON.stringify(metadata.runtime)) {
    throw new Error(
      'Nightfall V8 bytecode runtime mismatch; rebuild with current Electron runtime.',
    );
  }
  const directory = dirname(targetModule.filename);
  if (basename(metadata.bytecodeFile) !== metadata.bytecodeFile) {
    throw new Error('Invalid bytecode filename');
  }
  const cachedData = await readFile(join(directory, metadata.bytecodeFile));
  if (bytecodeDigest(cachedData) !== metadata.bytecodeSha256) {
    throw new Error('Nightfall V8 bytecode SHA-256 digest mismatch');
  }
  const source = ' '.repeat(metadata.sourceLength);
  const filename = join(directory, metadata.sourceFile);
  const script = new vm.Script(source, {
    cachedData,
    filename,
    importModuleDynamically: vm.constants.USE_MAIN_CONTEXT_DEFAULT_LOADER,
  });
  if (script.cachedDataRejected) {
    throw new Error('V8 rejected cachedData bytecode');
  }
  const run = script.runInThisContext();
  if (typeof run !== 'function') {
    throw new Error('Compiled V8 bytecode did not evaluate to a CommonJS wrapper');
  }
  run.call(
    targetModule.exports,
    targetModule.exports,
    targetRequire,
    targetModule,
    filename,
    directory,
  );
}

module.exports = { configureBytecodeRuntime, bytecodeDigest, loadBytecode };
