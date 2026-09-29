// Build identity (SPEC §9, S0.2): written to dist/version.json and to a <meta name="inkventure-build"> tag so a
// deployed page (or a device report from S0.3) can say exactly which commit it runs.
import { execSync } from 'node:child_process';
import type { Plugin } from 'vite';

export interface BuildInfo {
  /** Full commit SHA, or "unknown" outside a git checkout. */
  commit: string;
  /** Build time, ISO 8601 UTC. */
  date: string;
}

type Env = Record<string, string | undefined>;

function gitCommit(): string | undefined {
  try {
    return execSync('git rev-parse HEAD', { stdio: ['ignore', 'pipe', 'ignore'] })
      .toString()
      .trim();
  } catch {
    return undefined;
  }
}

/**
 * CI provides the commit in GITHUB_SHA; locally we ask git. SOURCE_DATE_EPOCH (seconds) pins the date for
 * reproducible builds.
 */
export function resolveBuildInfo(
  env: Env,
  now: Date,
  readGit: () => string | undefined = gitCommit,
): BuildInfo {
  const commit = env.GITHUB_SHA || readGit() || 'unknown';
  const epoch = Number(env.SOURCE_DATE_EPOCH);
  const date = env.SOURCE_DATE_EPOCH && !isNaN(epoch) ? new Date(epoch * 1000) : now;
  return { commit, date: date.toISOString() };
}

export function buildMetaContent(info: BuildInfo): string {
  return info.commit + ' ' + info.date;
}

/** Vite plugin: emits version.json and injects the build meta tag into every HTML page. */
export function buildInfoPlugin(
  info: BuildInfo = resolveBuildInfo(process.env, new Date()),
): Plugin {
  return {
    name: 'inkventure-build-info',
    apply: 'build',
    transformIndexHtml() {
      return [
        {
          tag: 'meta',
          attrs: { name: 'inkventure-build', content: buildMetaContent(info) },
          injectTo: 'head',
        },
      ];
    },
    generateBundle() {
      this.emitFile({
        type: 'asset',
        fileName: 'version.json',
        source: JSON.stringify(info, null, 2) + '\n',
      });
    },
  };
}
