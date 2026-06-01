/* Rasterize Bold Momentum brand SVGs → app PNGs (run: node brand/render.js) */
const sharp = require('sharp');
const fs = require('fs');
const path = require('path');

const OUT = path.join(__dirname, '..', 'assets', 'images');
const read = (f) => fs.readFileSync(path.join(__dirname, f));

async function render(svgFile, out, size, opaque) {
  let img = sharp(read(svgFile), { density: 384 }).resize(size, size, {
    fit: 'contain',
    background: { r: 0, g: 0, b: 0, alpha: 0 },
  });
  if (opaque) img = img.flatten({ background: '#0A0C0B' });
  await img.png().toFile(path.join(OUT, out));
  console.log('  wrote', out, `${size}px`, opaque ? '(opaque)' : '(alpha)');
}

(async () => {
  await render('icon.svg', 'icon.png', 1024, true); // iOS app icon (opaque)
  await render('glyph.svg', 'adaptive-foreground.png', 1024, false); // Android adaptive fg
  await render('glyph.svg', 'splash-icon.png', 288, false); // splash mark
  await render('sage.svg', 'sage.png', 512, false); // Sage mascot
  await render('icon.svg', 'favicon.png', 64, true); // web favicon
  console.log('brand assets rendered ✓');
})().catch((e) => {
  console.error(e);
  process.exit(1);
});
