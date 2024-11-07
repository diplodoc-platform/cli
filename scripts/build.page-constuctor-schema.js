const esbuild = require('esbuild');
const shell = require('shelljs');

const SCHEMA_GENERATOR_PATH = 'build/generate-pc-schema.js'

module.exports = () => {
  esbuild.buildSync({
    platform: 'node',
    entryPoints: ['scripts/generate-pc-schema.js'],
    bundle: true,
    outfile: SCHEMA_GENERATOR_PATH,
    loader: {
      '.css': 'empty',
    },
  })

  require(`../${SCHEMA_GENERATOR_PATH}`)();

  shell.rm('-f', SCHEMA_GENERATOR_PATH);
}
