// The Decker probe (story S0.11), dist/probe/decker/: the Decker web runtime, patched to suit an e-ink reader, and the
// tour deck. The page itself (index.html, probe.js) is static in public/probe/decker/. runtime.js is Decker's own build
// (scripts/web_decker.sh: lil.js, danger.js and decker.js after two globals) with the patches below, each of which must
// match the pinned upstream code exactly once: the build fails loudly when upstream moved.
//
// - Loop: upstream runs a tick (the whole UI redrawn into the frame buffer) and a sync (every pixel converted and put
//   on the canvas) on every animation frame, forever. Patched, a tick runs on an animation frame only while the deck is
//   busy (a running script, a sleep, a pending view event, a held pointer, a frame that changed); after two quiet ticks
//   the loop stops, and input starts it again. Animated widgets keep it ticking at a low rate (IK_SLOW_MS). One tick
//   per frame, no catch-up: a slow device slows the deck down instead of piling up ticks.
// - Sync: draws only when the frame buffer or the palette changed since the last draw (a resize forces it).
// - Transitions (`go[card "SlideLeft"]`) jump to their end: no transition modal.
// - Animated patterns are frozen (the "Show Animation" setting off); the field cursor no longer blinks.
// - Menus are off, as in a locked deck: the editor cannot be reached (its code is still there).
// - The card fills the width: upstream zooms only by whole steps outside full screen (a 512 px card stays 1:1 on a
//   636 px wide Kindle); patched, it zooms by the fraction that fits, drawn without smoothing so pixels stay sharp.
// - No black corners: the deck's `corners` (a classic Mac screen's rounded corners) are not drawn.
// - Measures for the probe page in `window.ikDecker`: ticks, draws, their last durations, the first draw, and for the
//   last input (pointer up or key) the time to its first draw, to a card change, and to the loop going idle.
import { existsSync, readFileSync } from 'node:fs';
import { join } from 'node:path';
import type { Plugin } from 'vite';
import { DECKER_VERSION } from './decker-files.ts';

type Replacement = [RegExp, string];

/** Ticks per second while animated widgets are on the card and nothing else happens. */
export const IK_SLOW_MS = 250;

const LOOP = `// Inkventure (S0.11, scripts/build/decker-probe.ts): ticks only while something happens; input wakes the loop.
const ik=window.ikDecker=window.ikDecker||{}
ik.ticks=0,ik.draws=0,ik.tickMs=0,ik.syncMs=0,ik.inputs=0,ik.awake=0
let ik_scheduled=0,ik_quiet=0
ik_busy=_=>running()||sleep_frames||sleep_play||msg.pending_view||msg.next_view||pointer.held||wid.change_timer||ms.type=='trans'
ik_animated=_=>uimode=='interact'&&con_wids().v.some(w=>lb(ifield(w,'animated'))||(contraption_is(w)&&ivalue(w,'widgets').v.some(c=>lb(ifield(c,'animated')))))
ik_schedule=delay=>{if(ik_scheduled)return;ik_scheduled=1,ik.awake=1;if(delay)setTimeout(loop,delay);else requestAnimationFrame(loop)}
ik_wake=_=>{ik_quiet=0,ik_schedule(0)}
ik_input=_=>{ik.input=performance.now(),ik.inputs++,ik.inputCard=ik.cardName,ik.response=null,ik.cardChange=null,ik.settle=null,ik_wake()}
ik_drawn=_=>{
	const now=performance.now(), card=ifield(deck,'card'), index=ln(ifield(card,'index'))
	ik.draws++;if(ik.firstDraw==null)ik.firstDraw=now
	if(ik.input!=null&&ik.response==null)ik.response=now-ik.input
	if(ik.input!=null&&ik.card!=null&&index!=ik.card)ik.cardChange=now-ik.input
	ik.card=index,ik.cardName=ls(ifield(card,'name'))
}
loop=_=>{
	ik_scheduled=0
	const t0=performance.now();tick();const t1=performance.now();ik.ticks++,ik.tickMs=t1-t0
	const drew=sync();if(drew)ik.syncMs=performance.now()-t1
	if(do_panic)setmode('object');do_panic=0
	if(drew&&ik.ondraw)ik.ondraw()
	const animated=ik_animated()
	if(ik_busy()||(drew&&!animated))ik_quiet=0;else ik_quiet++
	if(ik_quiet<2)ik_schedule(0)
	else if(animated)ik_schedule(${IK_SLOW_MS})
	else{ik.awake=0,ev.clicklast=0;if(ik.input!=null&&ik.settle==null)ik.settle=performance.now()-ik.input;if(ik.onidle)ik.onidle()}
}`;

/** The loop: a tick only while the deck is busy (upstream: one per 1/60 s with up to 5 of catch-up, forever). */
export const LOOP_PATCH: Replacement = [
  /^let prev_stamp=null, leftover=0\nloop=stamp=>\{\n(?:\t.*\n){5}\}$/m,
  LOOP,
];

/** The card fills the width (a fractional zoom); the page's body is only as tall as its content. */
export const ZOOM_PATCH: Replacement = [
  /^\tzoom=max\(1,is_fullscreen\(\)\?fs:\(0\|fs\)\)$/m,
  '\tzoom=max(1,min(screen.x/fb.size.x,window.innerHeight/fb.size.y)) // Inkventure: fill the width',
];

/** A resize draws again and wakes the loop. */
export const RESIZE_PATCH: Replacement = [
  /^window\.onresize=_=>\{resize\(\),sync\(\)\}$/m,
  'window.onresize=_=>{resize(),sync(1),ik_wake()}',
];

/** Transitions, animated patterns, the blinking cursor, menus and corners: off. */
export const STILL_PATCHES: Replacement[] = [
  [
    /^\tif\(ms\.type!='trans'&&x>=0&&tfun\)\{$/m,
    "\tif(0/* Inkventure: no transitions */&&ms.type!='trans'&&x>=0&&tfun){",
  ],
  [/^\tshow_widgets:1,show_anim:1,/m, '\tshow_widgets:1,show_anim:0,'],
  [
    /^\twid\.cursor_timer=\(wid\.cursor_timer\+1\)%\(2\*FIELD_CURSOR_DUTY\)$/m,
    '\twid.cursor_timer=0',
  ],
  [/^menus_off=_=>lb\(ifield\(deck,'locked'\)\)$/m, 'menus_off=_=>1'],
  [
    /^\tconst ccolor=ln\(ifield\(deck,'corners'\)\)$/m,
    '\tconst ccolor=0 // Inkventure: no corners',
  ],
];

/** Start: input wakes the loop; one first tick. `extra` runs just before it. */
export function startPatch(extra = ''): Replacement {
  return [
    /^resize\(\),requestAnimationFrame\(loop\)$/m,
    ";['mousedown','mousemove','touchstart','touchmove','wheel'].forEach(n=>q('body').addEventListener(n,ik_wake,{passive:true}))\n" +
      ";['mouseup','touchend','keydown'].forEach(n=>q('body').addEventListener(n,ik_input,{passive:true}))\n" +
      extra +
      'resize(),ik.started=performance.now(),ik_wake()',
  ];
}

export const PATCHES: Replacement[] = [
  LOOP_PATCH,
  // Sync: skip the draw when nothing changed.
  [
    /^let id=null\nsync=_=>\{\n\tpick_palette\(deck\)$/m,
    'let id=null,ik_pix=null,ik_pal=null\n' +
      'ik_same=(a,b)=>{if(!a||a.length!=b.length)return 0;for(let z=0;z<a.length;z++)if(a[z]!=b[z])return 0;return 1}\n' +
      'sync=force=>{\n' +
      '\tconst ik_p=deck.patterns.pal.pix;if(!force&&ik_same(ik_pix,fb.pix)&&ik_same(ik_pal,ik_p))return 0\n' +
      '\tik_pix=fb.pix.slice(0),ik_pal=ik_p.slice(0)\n' +
      '\tpick_palette(deck)',
  ],
  [
    /^(\tconst g=q\('#display'\)\.getContext\('2d'\);.*g\.drawImage\(r,0,0\),g\.restore\(\))\n\}$/m,
    '$1\n\tik_drawn();return 1\n}',
  ],
  ZOOM_PATCH,
  [
    /g\.imageSmoothingEnabled=zoom!=\(0\|zoom\),g\.save\(\),g\.scale\(zoom,zoom\)/m,
    'g.imageSmoothingEnabled=false,g.save(),g.scale(zoom,zoom)',
  ],
  RESIZE_PATCH,
  ...STILL_PATCHES,
  startPatch(),
];

/** Applies each replacement, which must match exactly once; throws naming the first one that does not. */
export function patchDecker(source: string, patches: Replacement[] = PATCHES): string {
  let out = source;
  for (const [pattern, replacement] of patches) {
    const global = new RegExp(
      pattern.source,
      pattern.flags.includes('g') ? pattern.flags : pattern.flags + 'g',
    );
    const count = (out.match(global) || []).length;
    if (count !== 1) {
      throw new Error(
        `Decker patch ${pattern} matched ${count} times in decker.js, expected once (did upstream change?)`,
      );
    }
    out = out.replace(pattern, (_match, group: unknown) =>
      replacement.replace('$1', typeof group === 'string' ? group : ''),
    );
  }
  return out;
}

/** runtime.js: what web_decker.sh puts in its <script>, decker.js patched, with start and end marks for the probe. */
export function buildRuntime(files: { lil: string; danger: string; decker: string }): string {
  return (
    '/* Decker ' +
    DECKER_VERSION +
    ' (c) John Earnest, MIT licence (LICENSE-decker.txt). Patched for Inkventure: scripts/build/decker-probe.ts. */\n' +
    'window.ikDecker=window.ikDecker||{};ikDecker.runStart=performance.now()\n' +
    `VERSION="${DECKER_VERSION}"\nDANGEROUS=0\n` +
    files.lil +
    '\n' +
    files.danger +
    '\n' +
    patchDecker(files.decker) +
    '\nikDecker.runEnd=performance.now()\n'
  );
}

const VENDOR = 'vendor/decker';

function readVendor(name: string): string {
  const path = join(VENDOR, name);
  if (!existsSync(path)) {
    throw new Error(
      `${path} is missing: run \`npm install\` (scripts/build/fetch-decker.ts) first.`,
    );
  }
  return readFileSync(path, 'utf8');
}

/** The probe's generated files, by their path under dist/. */
export function probeFiles(): Record<string, string> {
  return {
    'probe/decker/runtime.js': buildRuntime({
      lil: readVendor('lil.js'),
      danger: readVendor('danger.js'),
      decker: readVendor('decker.js'),
    }),
    'probe/decker/tour.deck': readVendor('tour.deck'),
    'probe/decker/LICENSE-decker.txt': readVendor('LICENSE'),
  };
}

export function deckerProbePlugin(): Plugin {
  return {
    name: 'inkventure-decker-probe',
    configureServer(server) {
      server.middlewares.use((req, res, next) => {
        const path = (req.url || '').split('?')[0].replace(/^\//, '');
        if (!/^probe\/decker\/(runtime\.js|tour\.deck|LICENSE-decker\.txt)$/.test(path))
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
