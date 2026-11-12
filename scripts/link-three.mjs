// Tests import 'three'; the browser uses the vendored build via importmap.
// This links the vendored file into node_modules so `npm test` works offline.
import { mkdirSync, writeFileSync, copyFileSync, existsSync } from 'node:fs';
const dir = 'node_modules/three';
if (!existsSync(dir)) mkdirSync(dir, { recursive: true });
copyFileSync('vendor/three.module.js', dir + '/three.module.js');
writeFileSync(dir + '/package.json', JSON.stringify({
  name: 'three', version: '0.160.0', type: 'module', main: 'three.module.js',
  exports: { '.': './three.module.js' },
}, null, 2));
console.log('three linked for tests');
