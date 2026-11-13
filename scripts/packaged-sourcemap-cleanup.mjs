import {
  existsSync,
  mkdirSync,
  mkdtempSync,
  readdirSync,
  readFileSync,
  rmSync,
  statSync,
  unlinkSync,
  writeFileSync,
} from 'node:fs';
import { tmpdir } from 'node:os';
import { extname, resolve } from 'node:path';

const SOURCEMAP_REFERENCE_EXTENSIONS = new Set(['.js', '.cjs', '.mjs', '.css']);
const SOURCE_MAPPING_URL_LINE_RE = /(?:^|\r?\n)[ \t]*\/\/[#@][ \t]*sourceMappingURL=[^\r\n]*/g;
const SOURCE_MAPPING_URL_BLOCK_RE =
  /(?:^|\r?\n)[ \t]*\/\*[#@][ \t]*sourceMappingURL=[\s\S]*?\*\/[ \t]*/g;

export function stripSourceMappingUrlComments(source) {
  return source.replace(SOURCE_MAPPING_URL_LINE_RE, '').replace(SOURCE_MAPPING_URL_BLOCK_RE, '');
}

function walkFiles(rootDir, visitor) {
  if (!existsSync(rootDir)) return;
  for (const entry of readdirSync(rootDir)) {
    const entryPath = resolve(rootDir, entry);
    const stat = statSync(entryPath);
    if (stat.isDirectory()) {
      walkFiles(entryPath, visitor);
    } else if (stat.isFile()) {
      visitor(entryPath);
    }
  }
}

export function stripSourceMappingUrlCommentsInDirectory(rootDir) {
  const summary = { filesChanged: 0, referencesRemoved: 0 };
  walkFiles(rootDir, (filePath) => {
    if (!SOURCEMAP_REFERENCE_EXTENSIONS.has(extname(filePath))) return;
    const source = readFileSync(filePath, 'utf8');
    const lineCount = source.match(SOURCE_MAPPING_URL_LINE_RE)?.length ?? 0;
    const blockCount = source.match(SOURCE_MAPPING_URL_BLOCK_RE)?.length ?? 0;
    const removed = lineCount + blockCount;
    if (removed === 0) return;
    writeFileSync(filePath, stripSourceMappingUrlComments(source));
    summary.filesChanged += 1;
    summary.referencesRemoved += removed;
  });
  return summary;
}

export function removeSourceMapFilesInDirectory(rootDir) {
  const summary = { filesRemoved: 0 };
  walkFiles(rootDir, (filePath) => {
    if (extname(filePath) !== '.map') return;
    unlinkSync(filePath);
    summary.filesRemoved += 1;
  });
  return summary;
}

export async function cleanupPackagedSourcemaps({
  appAsarPath,
  resourcesDir,
  runAsarCommand,
  replaceAppAsarFromStaging,
  preserveDebugMaps = false,
  logger = console,
}) {
  if (preserveDebugMaps) {
    logger.log('[afterPack] NIGHTFALL_DEBUG_BUILD=1: retaining debug sourcemaps for symbolicated stack traces');
    return;
  }

  if (existsSync(appAsarPath)) {
    mkdirSync(tmpdir(), { recursive: true });
    const stagingDir = mkdtempSync(resolve(tmpdir(), 'nightfall-asar-sourcemap-'));
    try {
      runAsarCommand(['extract', appAsarPath, stagingDir]);
      const stripSummary = stripSourceMappingUrlCommentsInDirectory(stagingDir);
      const mapSummary = removeSourceMapFilesInDirectory(stagingDir);
      if (stripSummary.referencesRemoved > 0 || mapSummary.filesRemoved > 0) {
        logger.log(
          `[afterPack] stripped sourceMappingURL references=${stripSummary.referencesRemoved} files=${stripSummary.filesChanged} maps=${mapSummary.filesRemoved}`,
        );
        await replaceAppAsarFromStaging({ sourceDir: stagingDir, appAsarPath });
      }
    } finally {
      rmSync(stagingDir, { force: true, recursive: true });
    }
  }

  stripSourceMappingUrlCommentsInDirectory(resourcesDir);
  removeSourceMapFilesInDirectory(resourcesDir);
}
