'use strict';

const { execFile } = require('node:child_process');
const { createHash, randomUUID } = require('node:crypto');
const fs = require('node:fs/promises');
const os = require('node:os');
const path = require('node:path');
const { promisify } = require('node:util');

const run = promisify(execFile);
const themeFile = 'windows-explorer-icon-theme.json';
const builtInExtensions = `7z aac ai apk avi bak bat bmp c cab cfg cmd conf cpp cs css csv db dll doc docx epub exe
  flac gif go gz h hpp htm html ico ini iso jar java jpeg jpg js json jsonc jsx kt log lua lnk md mkv mov mp3
  mp4 msi obj odt ogg otf pdf php png ppt pptx ps1 psd py pyw rar rb reg rs rtf sh sln sql svg tar tgz tif tiff
  toml ts tsx ttf txt vbs vsix wav webm webp woff woff2 xls xlsx xml yaml yml zip`.split(/\s+/);

function extensionsFor(extra) {
  const normalized = extra.filter(value => typeof value === 'string')
    .map(value => value.trim().toLowerCase().replace(/^\./, ''))
    .filter(value => /^[a-z0-9][a-z0-9_+-]{0,31}$/.test(value));
  return [...new Set([...builtInExtensions, ...normalized])].sort();
}

async function needsGeneration(extensionPath, extra) {
  const theme = JSON.parse(await fs.readFile(path.join(extensionPath, 'themes', themeFile), 'utf8'));
  return !theme.file || extensionsFor(extra).join(',') !== Object.keys(theme.fileExtensions).sort().join(',');
}

async function generateTheme(extensionPath, extra) {
  const extensions = extensionsFor(extra);
  const themeDir = path.join(extensionPath, 'themes');
  const iconsDir = path.join(themeDir, 'generated');
  const staging = await fs.mkdtemp(path.join(os.tmpdir(), 'windows-explorer-icons-'));
  const temporaryTheme = path.join(themeDir, `${randomUUID()}.tmp`);

  try {
    const powershell = path.join(process.env.SystemRoot, 'System32', 'WindowsPowerShell', 'v1.0', 'powershell.exe');
    await run(powershell, [
      '-NoLogo', '-NoProfile', '-NonInteractive', '-STA', '-ExecutionPolicy', 'Bypass',
      '-File', path.join(__dirname, 'windows-icons.ps1'),
      '-OutputDirectory', staging, '-ExtensionList', extensions.join(',')
    ], { windowsHide: true, timeout: 60_000, cwd: staging });

    await fs.mkdir(iconsDir, { recursive: true });
    const iconDefinitions = {};
    async function addIcon(name) {
      const image = await fs.readFile(path.join(staging, `${name}.png`));
      const id = createHash('sha256').update(image).digest('hex').slice(0, 24);
      if (!iconDefinitions[id]) {
        const filename = `${id}.png`;
        await fs.writeFile(path.join(iconsDir, filename), image);
        iconDefinitions[id] = { iconPath: `./generated/${filename}` };
      }
      return id;
    }

    const file = await addIcon('file');
    const folder = await addIcon('folder');
    const folderExpanded = await addIcon('folder-open');
    const fileExtensions = {};
    for (const extension of extensions) {
      try {
        fileExtensions[extension] = await addIcon(`ext-${extension}`);
      } catch (error) {
        if (error.code !== 'ENOENT') throw error;
        fileExtensions[extension] = file;
      }
    }

    const theme = { iconDefinitions, file, folder, folderExpanded, fileExtensions, showLanguageModeIcons: false };
    await fs.writeFile(temporaryTheme, `${JSON.stringify(theme, null, 2)}\n`);
    await fs.rename(temporaryTheme, path.join(themeDir, themeFile));
    return extensions.length;
  } finally {
    await fs.rm(temporaryTheme, { force: true });
    await fs.rm(staging, { recursive: true, force: true });
  }
}

module.exports = { generateTheme, needsGeneration };
