#!/usr/bin/env node

const {spawn} = require('child_process');
const {resolve} = require('path');

const jest = spawn('jest', [
    '--config', resolve(__dirname, 'jest.config.js'),
    ...process.argv.slice(2)
], {
    stdio: 'inherit'
});

jest.on('exit', (code) => {
    process.exit(code || 0);
}); 
