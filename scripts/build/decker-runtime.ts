// The app's Decker runtime (story S1.29): the pinned Decker release with the e-ink patches of the S0.11 probe
// (decker-probe.ts), plus what the reader needs, as two minified scripts the Decker reader puts in its sandboxed frame:
// `lil` (the Lil interpreter, lil.js) and `ui` (danger.js and decker.js, patched, then the bridge below). Two files
// because together they are over the 100 KiB gz lazy-chunk budget, and each one fits.
//
// On top of the probe's patches:
// - Draw: only the rows of the frame buffer that changed since the last draw are converted and put on the canvas, and
//   a pixel's colour comes from a table built once per palette (pattern x position in its 8 x 8 tile) instead of a few
//   function calls per pixel. The probe measured ~550 ms per draw on the Kindle.
// - The zoom is a whole number of device pixels per deck pixel (the largest that fits), and the display canvas is
//   sized in device pixels: every deck pixel is the same square of screen pixels, sharp, with regular dithers.
// - Decker's drawn keyboard (`keycaps`) is never shown: typing goes through a hidden input of the page (the bridge),
//   so that the device's own keyboard opens.
// - The bridge (plain code after decker.js, using its globals) talks to the reader with `postMessage`: the deck's
//   title, the deck itself (serialized as Decker saves it) a moment after the player changed something, and errors;
//   and it puts the hidden input over an editable field when one is tapped, focusing it within the tap so that the
//   device keyboard opens.
import { existsSync, readFileSync } from 'node:fs';
import { createHash } from 'node:crypto';
import { join } from 'node:path';
import { transformSync } from 'esbuild';
import type { Plugin } from 'vite';
import { DECKER_VERSION } from './decker-files.ts';
import {
  LOOP_PATCH,
  patchDecker,
  RESIZE_PATCH,
  startPatch,
  STILL_PATCHES,
} from './decker-probe.ts';

type Replacement = [RegExp, string];

/** The draw: changed rows only, colours from a table. Replaces upstream's `sync` whole. */
export const SYNC = `// Inkventure (S1.29, scripts/build/decker-runtime.ts): draws only the rows that changed, colours from a table.
let ik_id=null,ik_px=null,ik_prev=null,ik_lut=null,ik_lutkey=null,ik_dpr=1
ik_rgba=c=>{const v=COLORS[c];return (0xFF000000|((0xFF&v)<<16)|(0xFF00&v)|(0xFF&(v>>16)))>>>0}
ik_color=(pal,anim,p,x,y)=>{
	const a=p<28||p>31?p: anim[p-28][0]
	return a>=32+PAL_COLORS?0: a>31?a-32: a<2?(a?15:0): (pal_pat(pal,a,x,y)&1)?15:0
}
ik_table=(pal,anim)=>{
	const t=new Uint32Array(256*64), rgba=[];for(let c=0;c<16;c++)rgba[c]=ik_rgba(c)
	for(let p=0;p<256;p++)for(let y=0;y<8;y++)for(let x=0;x<8;x++)t[p*64+y*8+x]=rgba[ik_color(pal,anim,p,x,y)]
	return t
}
sync=force=>{
	pick_palette(deck)
	const pal=deck.patterns.pal.pix, anim=deck.patterns.anim, w=fb.size.x, h=fb.size.y, pix=fb.pix
	const key=Array.prototype.join.call(pal,',')+'|'+JSON.stringify(anim)+'|'+COLORS.join(',')
	if(!ik_id||ik_id.width!=w||ik_id.height!=h){ik_id=new ImageData(w,h),ik_px=new Uint32Array(ik_id.data.buffer),ik_prev=null}
	if(key!==ik_lutkey){ik_lut=ik_table(pal,anim),ik_lutkey=key,ik_prev=null}
	let y0=0,y1=h-1
	if(!force&&ik_prev){
		y0=h,y1=-1
		for(let y=0;y<h;y++){const o=y*w;for(let x=0;x<w;x++)if(pix[o+x]!==ik_prev[o+x]){y0=y;break};if(y0<h)break}
		if(y0<h)for(let y=h-1;y>=y0;y--){const o=y*w;let d=0;for(let x=0;x<w;x++)if(pix[o+x]!==ik_prev[o+x]){d=1;break};if(d){y1=y;break}}
		if(y1<y0)return 0
	}
	const lut=ik_lut
	for(let y=y0;y<=y1;y++){
		const o=y*w, ty=(y&7)*8
		for(let x=0;x<w;x++){const p=pix[o+x];ik_px[o+x]=p===ANTS?ik_rgba((0|((x+y+(0|(frame_count/2)))/3))%2?15:0):lut[p*64+ty+(x&7)]}
	}
	ik_prev=pix.slice(0)
	const r=q('#render');r.getContext('2d').putImageData(ik_id,0,0,0,y0,w,y1-y0+1)
	// One row more on each side: at a fractional zoom the edges of a strip fall between device pixels.
	const a=max(0,y0-1),b=min(h,y1+2),d=q('#display'),g=d.getContext('2d')
	g.imageSmoothingEnabled=false,g.save(),g.scale(d.width/w,d.height/h),g.drawImage(r,0,a,w,b-a,0,a,w,b-a),g.restore()
	ik_drawn();return 1
}`;

/**
 * The display canvas at the screen's own resolution (its CSS size times `devicePixelRatio`): drawn into without
 * smoothing, so that the browser does not scale it again (the Kindle's, at 2 device pixels per CSS pixel, smoothed the
 * card scaled to the width, which blurred it). `zoom` stays in CSS pixels, for Decker's pointer.
 */
/**
 * The zoom: the largest whole number of device pixels per deck pixel that fits the width and the window's height
 * (at least 1), so that every deck pixel is the same square of screen pixels and dithers stay regular. On the
 * Kindle (2 device pixels per CSS pixel, 636 CSS pixels wide) that is 2: the card at 512 CSS pixels, as sharp as the
 * S0.11 probe at 1:1. (Filling the width, × 2.48 there, made cells of 2 or 3 pixels: irregular dithers; the owner
 * chose sharp.) `zoom` is in CSS pixels, as Decker's pointer expects.
 */
const APP_ZOOM_PATCH: Replacement = [
  /^\tzoom=max\(1,is_fullscreen\(\)\?fs:\(0\|fs\)\)$/m,
  '\tik_dpr=window.devicePixelRatio||1,zoom=max(1,Math.floor(min(screen.x*ik_dpr/fb.size.x,window.innerHeight*ik_dpr/fb.size.y)))/ik_dpr // Inkventure: whole device pixels',
];

const DISPLAY_PATCH: Replacement = [
  /^\tconst c =q\('#display'\);c \.width=fb\.size \.x\*zoom,c\.height =fb\.size \.y\*zoom$/m,
  "\tconst c =q('#display');c.width=Math.round(fb.size.x*zoom*ik_dpr),c.height=Math.round(fb.size.y*zoom*ik_dpr),c.style.width=(fb.size.x*zoom)+'px',c.style.height=(fb.size.y*zoom)+'px'",
];

/** Upstream's `sync`, from its declaration to the end of the function. */
const SYNC_PATCH: Replacement = [/^let id=null\nsync=_=>\{\n(?:\t.*\n)*?\}$/m, SYNC];

/** Decker's drawn keyboard: never (the bridge's hidden input opens the device keyboard). */
const KEYCAPS_PATCH: Replacement = [
  /^keycaps_enter=_=>\{if\(!enable_touch\|\|kc\.on\)return;keycaps_force_enter\(\)\}$/m,
  'keycaps_enter=_=>{} // Inkventure: the device keyboard instead',
];

export const APP_PATCHES: Replacement[] = [
  LOOP_PATCH,
  SYNC_PATCH,
  APP_ZOOM_PATCH,
  DISPLAY_PATCH,
  RESIZE_PATCH,
  ...STILL_PATCHES,
  KEYCAPS_PATCH,
  startPatch(),
];

/** How long after the deck goes idle its state is sent to the reader to be saved. */
export const SAVE_DELAY_MS = 1000;

/**
 * The bridge to the reader. Messages to it carry `ikDecker: 1` and a `type`: `ready` (first card drawn), `title`,
 * `save` (`deck`: the deck as Decker writes it), `error` (`message`).
 */
const BRIDGE = `// Inkventure (S1.29): the bridge to the reader (title, saves, errors) and typing with the device keyboard.
ik_bridge=_=>{
	const post=m=>{m.ikDecker=1;parent.postMessage(m,'*')}
	window.addEventListener('error',e=>post({type:'error',message:String(e.message||e)}))
	let title=null,saved=null,savedInputs=0,timer=0,ready=0
	const save=_=>{timer=0;const text=deck_write(deck);if(text!==saved){saved=text;post({type:'save',deck:text})}}
	ik.ondraw=_=>{if(!ready){ready=1;post({type:'ready'})}flush()}
	ik.onidle=_=>{
		const t=document.title;if(t!==title){title=t;post({type:'title',title:t})}
		if(ik.inputs!==savedInputs){savedInputs=ik.inputs;clearTimeout(timer);timer=setTimeout(save,${SAVE_DELAY_MS})}
		flush();if(!wid.infield&&document.activeElement===input)input.value='',input.blur()
	}
	// Typing: an input over the tapped field, focused during the tap so that the device keyboard opens. Decker enters
	// the field at its next tick: until then what is typed stays in the input, and goes to the field once it is in it
	// (flush). Then a key Decker understands reaches it by the page's keydown handler (which cancels the key), and what
	// the keyboard sends otherwise (an "input" event) is passed to the field here.
	const flush=_=>{if(wid.infield&&input.value){const text=input.value;input.value='';field_input(clchars(text)),ik_wake()}}
	const input=document.createElement('input'),display=q('#display')
	input.type='text',input.id='ik-input',input.setAttribute('autocomplete','off'),input.setAttribute('autocapitalize','off')
	input.style.cssText='position:absolute;opacity:0;width:1px;height:1px;border:0;padding:0;font-size:16px;left:0;top:0'
	document.body.appendChild(input)
	const fieldAt=(cx,cy)=>{
		if(ms.type!=null||uimode!='interact')return null
		const r=display.getBoundingClientRect(),x=(cx-r.left)/zoom,y=(cy-r.top)/zoom,ws=con_wids().v
		for(let i=ws.length-1;i>=0;i--){
			const w=ws[i];if(!field_is(w))continue
			const f=unpack_field(w);if(f.locked||f.show=='none')continue
			if(x>=f.size.x&&y>=f.size.y&&x<f.size.x+f.size.w&&y<f.size.y+f.size.h)return {f:f,r:r}
		}return null
	}
	const focusAt=(cx,cy)=>{
		const hit=fieldAt(cx,cy);if(!hit)return
		const b=hit.f.size,r=hit.r
		input.style.left=(r.left+window.scrollX+b.x*zoom)+'px',input.style.top=(r.top+window.scrollY+(b.y+b.h)*zoom-1)+'px'
		input.value='',input.focus()
	}
	q('body').addEventListener('touchend',e=>{const t=e.changedTouches[0];if(t)focusAt(t.clientX,t.clientY)},{passive:true})
	q('body').addEventListener('mouseup',e=>focusAt(e.clientX,e.clientY))
	// Before Decker is in the field, a character stays in the input (Decker's handler would drop it).
	input.addEventListener('keydown',e=>{if(!wid.infield&&e.key&&e.key.length==1&&!e.ctrlKey&&!e.metaKey)e.stopPropagation()})
	input.addEventListener('input',_=>{flush();if(input.value)ik_wake()})
}
// After decker.js has started the deck: its first tick waits for an animation frame.
ik_bridge()`;

const HEADER = `/* Decker ${DECKER_VERSION} (c) John Earnest, MIT licence. Patched for Inkventure: scripts/build/decker-runtime.ts. */\n`;

function minify(source: string): string {
  return transformSync(source, { minify: true, target: 'es2017', legalComments: 'none' }).code;
}

/** The two scripts, unminified: `lil` (with web-decker's two globals) and `ui`. */
export function buildAppRuntime(files: { lil: string; danger: string; decker: string }): {
  lil: string;
  ui: string;
} {
  return {
    lil: `VERSION="${DECKER_VERSION}"\nDANGEROUS=0\n` + files.lil,
    ui:
      'window.ikDecker=window.ikDecker||{}\n' +
      files.danger +
      '\n' +
      patchDecker(files.decker, APP_PATCHES) +
      '\n' +
      BRIDGE +
      '\n',
  };
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

/** The minified scripts, with the licence header; and the tour deck (the reader's fixture). */
export function appRuntimeFiles(): { lil: string; ui: string; tour: string } {
  const built = buildAppRuntime({
    lil: readVendor('lil.js'),
    danger: readVendor('danger.js'),
    decker: readVendor('decker.js'),
  });
  return {
    lil: HEADER + minify(built.lil),
    ui: HEADER + minify(built.ui),
    tour: readVendor('tour.deck'),
  };
}

function hash(text: string): string {
  return createHash('sha256').update(text).digest('hex').slice(0, 8);
}

const VIRTUAL = 'virtual:decker-runtime';
const RESOLVED = '\0' + VIRTUAL;

/**
 * `import { lilUrl, uiUrl, tourUrl } from 'virtual:decker-runtime'`: the URLs of the two scripts and of the tour deck.
 * Built as assets (`assets/decker-lil-<hash>.js`…, so the size check budgets them as lazy chunks); served by the dev
 * server under `/@decker/`.
 */
export function deckerRuntimePlugin(): Plugin {
  let files: ReturnType<typeof appRuntimeFiles> | null = null;
  const get = () => (files = files || appRuntimeFiles());
  let serve = false;
  return {
    name: 'inkventure-decker-runtime',
    configResolved(config) {
      serve = config.command === 'serve';
    },
    resolveId(id) {
      return id === VIRTUAL ? RESOLVED : null;
    },
    load(id) {
      if (id !== RESOLVED) return null;
      const f = get();
      if (serve) {
        return (
          `export const lilUrl='/@decker/lil.js?v=${hash(f.lil)}';\n` +
          `export const uiUrl='/@decker/ui.js?v=${hash(f.ui)}';\n` +
          `export const tourUrl='/@decker/tour.deck';\n`
        );
      }
      const lil = this.emitFile({
        type: 'asset',
        fileName: `assets/decker-lil-${hash(f.lil)}.js`,
        source: f.lil,
      });
      const ui = this.emitFile({
        type: 'asset',
        fileName: `assets/decker-ui-${hash(f.ui)}.js`,
        source: f.ui,
      });
      const tour = this.emitFile({
        type: 'asset',
        fileName: `assets/decker-tour-${hash(f.tour)}.deck`,
        source: f.tour,
      });
      return (
        `export const lilUrl=import.meta.ROLLUP_FILE_URL_${lil};\n` +
        `export const uiUrl=import.meta.ROLLUP_FILE_URL_${ui};\n` +
        `export const tourUrl=import.meta.ROLLUP_FILE_URL_${tour};\n`
      );
    },
    configureServer(server) {
      server.middlewares.use((req, res, next) => {
        const path = (req.url || '').split('?')[0];
        const name = path.replace(/^\/@decker\//, '');
        if (name === path || !/^(lil\.js|ui\.js|tour\.deck)$/.test(name)) return next();
        const f = get();
        const body = name === 'lil.js' ? f.lil : name === 'ui.js' ? f.ui : f.tour;
        res.setHeader(
          'Content-Type',
          (name.endsWith('.js') ? 'text/javascript' : 'text/plain') + '; charset=utf-8',
        );
        res.end(body);
      });
    },
  };
}
