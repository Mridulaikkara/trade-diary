const fs = require('fs');
const path = require('path');
const { execSync } = require('child_process');

console.log('1. Building Tailwind CSS...');
execSync('npx tailwindcss -i ./css/input.css -o ./css/styles.css --minify', {
  cwd: __dirname,
  stdio: 'inherit'
});

console.log('2. Reading compiled CSS and JS assets...');
const cssContent = fs.readFileSync(path.join(__dirname, 'css/styles.css'), 'utf8');
const calcJs = fs.readFileSync(path.join(__dirname, 'js/calculator.js'), 'utf8');
const dbJs = fs.readFileSync(path.join(__dirname, 'js/db.js'), 'utf8');
const appJs = fs.readFileSync(path.join(__dirname, 'js/app.js'), 'utf8');

console.log(`  CSS size: ${(cssContent.length / 1024).toFixed(1)} KB`);
console.log(`  Calculator JS size: ${(calcJs.length / 1024).toFixed(1)} KB`);
console.log(`  DB JS size: ${(dbJs.length / 1024).toFixed(1)} KB`);
console.log(`  App JS size: ${(appJs.length / 1024).toFixed(1)} KB`);

console.log('3. Reading template index.html...');
let html = fs.readFileSync(path.join(__dirname, 'index.html'), 'utf8');

// Replace external stylesheet link with embedded <style>
const styleTag = `<style id="app-compiled-styles">\n${cssContent}\n</style>`;
html = html.replace(/<link rel="stylesheet" href="css\/styles\.css[^"]*"\/>/, styleTag);

// Remove the external script tags in head
html = html.replace(/<script src="js\/calculator\.js[^"]*"><\/script>\s*<script src="js\/db\.js[^"]*"><\/script>\s*<script src="js\/app\.js[^"]*"><\/script>/, '');

// Append self-contained bundle at the end of body before </body>
const bundledScript = `
  <!-- Self-Contained Atomic Application Engine (Zero External Latency) -->
  <script id="app-bundle-engine">
    /* ==========================================================================
       SECTION 1: NSE TARIFF & BREAKEVEN ENGINE
       ========================================================================== */
    ${calcJs}

    /* ==========================================================================
       SECTION 2: STORAGE & DATABASE ENGINE (LocalStorage + IndexedDB)
       ========================================================================== */
    ${dbJs}

    /* ==========================================================================
       SECTION 3: CORE APPLICATION & EVENT ENGINE
       ========================================================================== */
    ${appJs}
  </script>
</body>`;

html = html.replace('</body>', bundledScript);

fs.writeFileSync(path.join(__dirname, 'index.html'), html, 'utf8');
console.log(`4. Successfully bundled index.html! Total size: ${(html.length / 1024).toFixed(1)} KB`);
