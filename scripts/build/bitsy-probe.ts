// The Bitsy probe (story S0.12), dist/probe/bitsy/: Bitsy's engine with an e-ink system layer, and two games. The page
// itself (index.html, probe.js) and our game (keepers-lamp.bitsy) are static in public/probe/bitsy/.
//
// runtime.js follows the order of Bitsy's export template (dev/resources/export/exportTemplate.html): the system layer,
// then the engine. The engine files and upstream system.js and graphics.js are unchanged; input and sound are ours
// (scripts/build/bitsy-eink/input.js, sound.js, loaded where upstream input.js and soundchip.js go), and eink.js comes
// last: it replaces the 60 Hz loop and sets the engine's e-ink settings (see its header).
//
// Bitsy is ES5, so the whole runtime is checked by `check:es5`.
import { existsSync, readFileSync } from 'node:fs';
import { join } from 'node:path';
import type { Plugin } from 'vite';
import { BITSY_COMMIT, BITSY_ENGINE, BITSY_VERSION } from './bitsy-files.ts';

const VENDOR = 'vendor/bitsy';
const EINK = 'scripts/build/bitsy-eink';

function readVendor(name: string): string {
  const path = join(VENDOR, name);
  if (!existsSync(path)) {
    throw new Error(
      `${path} is missing: run \`npm install\` (scripts/build/fetch-bitsy.ts) first.`,
    );
  }
  return readFileSync(path, 'utf8');
}

function readEink(name: string): string {
  return readFileSync(join(EINK, name), 'utf8');
}

/** runtime.js: the system layer and the engine as an export loads them, with start and end marks for the probe. */
export function buildRuntime(
  read: (name: string) => string = readVendor,
  eink: (name: string) => string = readEink,
): string {
  const parts = [
    '/* Bitsy ' +
      BITSY_VERSION +
      ' (commit ' +
      BITSY_COMMIT.slice(0, 8) +
      ') (c) Adam Le Doux and the Bitsy authors, MIT licence (LICENSE-bitsy.txt).\n' +
      ' * With an e-ink system layer by Inkventure: scripts/build/bitsy-probe.ts, scripts/build/bitsy-eink/. */',
    'window.ikBitsy=window.ikBitsy||{};ikBitsy.runStart=window.performance?performance.now():0;',
    eink('input.js'),
    eink('sound.js'),
    read('graphics.js'),
    read('system.js'),
    ...BITSY_ENGINE.map((name) => read(name)),
    eink('eink.js'),
    'ikBitsy.runEnd=window.performance?performance.now():0;',
  ];
  return parts.join('\n;\n') + '\n';
}

/** The probe's generated files, by their path under dist/. */
export function probeFiles(): Record<string, string> {
  return {
    'probe/bitsy/runtime.js': buildRuntime(),
    'probe/bitsy/default.bitsy': readVendor('default.bitsy'),
    'probe/bitsy/ascii_small.bitsyfont': readVendor('ascii_small.bitsyfont'),
    'probe/bitsy/LICENSE-bitsy.txt': readVendor('LICENSE'),
  };
}

export function bitsyProbePlugin(): Plugin {
  return {
    name: 'inkventure-bitsy-probe',
    configureServer(server) {
      server.middlewares.use((req, res, next) => {
        const path = (req.url || '').split('?')[0].replace(/^\//, '');
        if (
          !/^probe\/bitsy\/(runtime\.js|default\.bitsy|ascii_small\.bitsyfont|LICENSE-bitsy\.txt)$/.test(
            path,
          )
        )
          return next();
        const type = path.endsWith('.js') ? 'text/javascript' : 'text/plain';
        res.setHeader('Content-Type', type + '; charset=utf-8');
        res.end(probeFiles()[path]);
      });
    },
    generateBundle() {
      for (const [fileName, source] of Object.entries(probeFiles())) {
        this.emitFile({ type: 'asset', fileName, source });
      }
    },
  };
}
