export function stripSourceMappingUrlComments(source: string): string;
export function stripSourceMappingUrlCommentsInDirectory(rootDir: string): {
  filesChanged: number;
  referencesRemoved: number;
};
export function removeSourceMapFilesInDirectory(rootDir: string): { filesRemoved: number };
