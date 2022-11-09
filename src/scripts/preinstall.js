const fs = require('fs');
const path = require('path');
const {execSync} = require('child_process');

if (!fs.existsSync(path.join(__dirname, 'build'))) {
    console.log('It seems we are installing from the git repo.');
    execSync('npm run build');
}
