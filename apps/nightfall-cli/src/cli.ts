import { runNightfallCli } from './index.js';

const result = await runNightfallCli(process.argv.slice(2));
if (result.stdout) {
  process.stdout.write(`${result.stdout}\n`);
}
if (result.stderr) {
  process.stderr.write(`${result.stderr}\n`);
}
process.exit(result.exitCode);
