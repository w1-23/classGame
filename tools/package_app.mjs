import packager from 'electron-packager';

packager({
  dir: process.cwd(),
  name: 'LearningAdventurePark',
  platform: 'win32',
  arch: 'x64',
  out: 'dist-app',
  overwrite: true,
  asar: true
}).then(results => {
  console.log(JSON.stringify(results, null, 2));
}).catch(error => {
  console.error(error);
  process.exit(1);
});
