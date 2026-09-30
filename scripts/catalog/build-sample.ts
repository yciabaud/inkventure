// Regenerates the sample catalogue in public/catalog/ (npm run catalog:sample). Run it after changing the fixtures,
// the resolver or the emitter; a unit test fails while the committed sample is out of date.
import { writeCatalog } from './files.ts';
import { sampleCatalog } from './sample.ts';

const files = await sampleCatalog();
writeCatalog('public/catalog', files);
console.log(`Sample catalogue written to public/catalog (${Object.keys(files).length} files).`);
