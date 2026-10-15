import { javascript, typescript } from 'projen';
const project = new typescript.TypeScriptProject({
  defaultReleaseBranch: 'main',
  name: 'FHLScripts',
  packageManager: javascript.NodePackageManager.PNPM,
  projenrcTs: true,

  // deps: [],                /* Runtime dependencies of this module. */
  deps: [
    'axios',
    'cheerio',
  ],
  devDeps: [
    '@types/cheerio',
    '@types/node',
    'axios',
    'cheerio',
  ],
});
project.synth();