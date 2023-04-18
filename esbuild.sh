esbuild src/index.ts --outfile=build/index.js \
  --platform=node --format=cjs \
  --bundle --packages=external \
  --sourcemap \
  --define:VERSION="\"$(node -pe "require('./package.json').version")\"" \
  --banner:js="#!/usr/bin/env node"

esbuild src/workers/linter/index.ts --outfile=build/linter.js \
  --platform=node --format=cjs \
  --bundle --packages=external \
  --sourcemap \
  --define:VERSION="\"$(node -pe "require('./package.json').version")\""
