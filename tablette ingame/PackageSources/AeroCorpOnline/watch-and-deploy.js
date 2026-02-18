const { spawn } = require('child_process');
const fs = require('fs');
const path = require('path');

// Paths
const DIST_DIR = path.join(__dirname, 'dist');
const COMMUNITY_DIR = 'C:\\Users\\tinou\\AppData\\Local\\Packages\\Microsoft.Limitless_8wekyb3d8bbwe\\LocalCache\\Packages\\Community2024\\aerocorp-online-efb\\html_ui\\efb_ui\\efb_apps\\AeroCorpOnline';
const PACKAGES_DIR = path.join(__dirname, '..', '..', 'Packages', 'aerocorp-online-efb', 'html_ui', 'efb_ui', 'efb_apps', 'AeroCorpOnline');

// Files to copy
const FILES_TO_COPY = ['AeroCorpOnline.js', 'AeroCorpOnline.css'];

function copyFiles() {
  console.log('\n[DEPLOY] Copying files...');

  FILES_TO_COPY.forEach(file => {
    const src = path.join(DIST_DIR, file);
    if (fs.existsSync(src)) {
      // Copy to Community2024
      const destCommunity = path.join(COMMUNITY_DIR, file);
      fs.copyFileSync(src, destCommunity);
      console.log(`  -> ${file} -> Community2024`);

      // Copy to Packages
      const destPackages = path.join(PACKAGES_DIR, file);
      fs.copyFileSync(src, destPackages);
      console.log(`  -> ${file} -> Packages`);
    }
  });

  // Play sound notification (Windows)
  console.log('\n[READY] Build termine! Restart MSFS pour voir les changements.');
  console.log('        ' + new Date().toLocaleTimeString());

  // Beep sound
  process.stdout.write('\x07');
}

function watchDist() {
  console.log('[WATCH] Watching dist folder for changes...\n');

  let debounceTimer = null;

  fs.watch(DIST_DIR, (eventType, filename) => {
    if (filename && FILES_TO_COPY.includes(filename)) {
      // Debounce to avoid multiple copies
      if (debounceTimer) clearTimeout(debounceTimer);
      debounceTimer = setTimeout(() => {
        copyFiles();
      }, 500);
    }
  });
}

// Main
console.log('=======================================');
console.log('  AeroCorp Online - Watch & Deploy');
console.log('=======================================\n');

// Initial copy
if (fs.existsSync(path.join(DIST_DIR, 'AeroCorpOnline.js'))) {
  copyFiles();
}

// Start esbuild watch mode
console.log('\n[BUILD] Starting esbuild watch mode...\n');

const buildProcess = spawn('npm', ['run', 'watch'], {
  cwd: __dirname,
  shell: true,
  stdio: 'inherit'
});

// Watch dist folder for changes
watchDist();

// Handle exit
process.on('SIGINT', () => {
  console.log('\n[EXIT] Stopping...');
  buildProcess.kill();
  process.exit(0);
});
