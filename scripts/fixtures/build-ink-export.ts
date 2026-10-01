// `npm install` / `npm ci` postinstall: builds the zipped ink web export of the sample catalogue (story S2.7),
// tests/fixtures/ink/tide.zip, from the compiled ink fixture (lamp.json): laid out as Inky's "Export for web"
// (`index.html`, `ink.js`, `main.js`, `style.css`), with the story in a script named after the project
// (`tide.js`: `var storyContent = {…};`), as most real exports are. `ink.js` and `main.js` are stand-ins: the app never
// runs an export's scripts. A fixed date, so the zip only changes with its content. Not committed (built at install).
import { zipSync } from 'fflate';
import { existsSync, readFileSync, writeFileSync } from 'node:fs';

const OUT = 'tests/fixtures/ink/tide.zip';

const json = readFileSync('tests/fixtures/ink/lamp.json', 'utf8').replace(/^\uFEFF/, '');
const page = `<!DOCTYPE html>
<html>
<head>
    <meta charset="UTF-8">
    <title>Ink and Tide</title>
    <link rel="stylesheet" href="style.css">
</head>
<body>
    <div class="outerContainer"><div id="story" class="container"></div></div>
    <script src="ink.js"></script>
    <script src="tide.js"></script>
    <script src="main.js"></script>
</body>
</html>
`;
const text = (value: string) => new TextEncoder().encode(value);
const mtime = new Date('2026-01-01T00:00:00Z');
const zip = zipSync(
  {
    'tide/index.html': [text(page), { mtime: mtime }],
    'tide/style.css': [text('body { background: #222; color: #eee; }\n'), { mtime: mtime }],
    'tide/ink.js': [text('// Stand-in for the inkjs runtime of an export.\n'), { mtime: mtime }],
    'tide/tide.js': [text('var storyContent = ' + json + ';'), { mtime: mtime }],
    'tide/main.js': [
      text(
        "// Stand-in for Inky's main.js: never run by the app.\nthrow new Error('main.js ran');\n",
      ),
      { mtime: mtime },
    ],
  },
  { level: 6 },
);
if (!existsSync(OUT) || Buffer.compare(readFileSync(OUT), zip) !== 0) {
  writeFileSync(OUT, zip);
  console.log('Built ' + OUT);
}
