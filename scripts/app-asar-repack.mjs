import { access, rename, rm } from 'node:fs/promises';

export const ASAR_UNPACK_NATIVE_GLOB = '*.{node,dll,dylib,exe}';

async function pathExists(targetPath) {
  try {
    await access(targetPath);
    return true;
  } catch {
    return false;
  }
}

export function createAppAsarPackArgs({ sourceDir, destinationPath }) {
  return ['pack', sourceDir, destinationPath, '--unpack', ASAR_UNPACK_NATIVE_GLOB];
}

export async function replaceAppAsarFromStaging({ sourceDir, appAsarPath, runAsarCommand }) {
  const candidateAsarPath = `${appAsarPath}.next`;
  const candidateUnpackedPath = `${candidateAsarPath}.unpacked`;
  const unpackedPath = `${appAsarPath}.unpacked`;

  await Promise.all([
    rm(candidateAsarPath, { force: true, recursive: true }),
    rm(candidateUnpackedPath, { force: true, recursive: true }),
  ]);

  try {
    runAsarCommand(
      createAppAsarPackArgs({
        sourceDir,
        destinationPath: candidateAsarPath,
      }),
    );

    if (!(await pathExists(candidateAsarPath))) {
      throw new Error(`Repacked app.asar candidate was not created: ${candidateAsarPath}`);
    }

    await rm(unpackedPath, { force: true, recursive: true });
    if (await pathExists(candidateUnpackedPath)) {
      await rename(candidateUnpackedPath, unpackedPath);
    }
    await rm(appAsarPath, { force: true });
    await rename(candidateAsarPath, appAsarPath);
  } finally {
    await Promise.all([
      rm(candidateAsarPath, { force: true, recursive: true }),
      rm(candidateUnpackedPath, { force: true, recursive: true }),
    ]);
  }
}
