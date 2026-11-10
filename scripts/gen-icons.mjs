import sharp from 'sharp';
const d = 'public/icons/';
const j = (f, s, o) => sharp(d + f, { density: 300 }).resize(s, s).png().toFile(d + o);
await j('icon.svg', 192, 'icon-192.png');
await j('icon.svg', 512, 'icon-512.png');
await j('icon.svg', 180, 'apple-touch-icon.png');
await j('icon-maskable.svg', 512, 'icon-512-maskable.png');
