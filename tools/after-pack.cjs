const fs = require('fs/promises');
const path = require('path');

module.exports = async function afterPack(context) {
  if (process.platform !== 'win32') {
    return;
  }

  const productFilename = context.packager.appInfo.productFilename;
  const executableName = `${productFilename}.exe`;
  const coreExecutableName = `${productFilename}-core.exe`;
  const appDirectory = context.appOutDir;
  const executablePath = path.join(appDirectory, executableName);
  const coreExecutablePath = path.join(appDirectory, coreExecutableName);
  const launcherPath = path.join(context.packager.projectDir, 'build', 'ClassGameLauncher.exe');

  await fs.access(executablePath);
  await fs.access(launcherPath);
  await fs.rename(executablePath, coreExecutablePath);
  await fs.copyFile(launcherPath, executablePath);
};
