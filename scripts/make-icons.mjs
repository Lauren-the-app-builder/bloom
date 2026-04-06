// Generate simple Bloom icons by writing an HTML file + instructions.
// For MVP we'll just write a PNG via a Buffer trick — or skip and use SVG favicon.
// Vercel + iOS PWAs need PNGs for home screen icons.
// Simplest: base64 decode a pre-made pink gradient PNG.

import fs from 'node:fs';
import path from 'node:path';

// 512x512 SVG — rendered to PNG by sharp/sips/browser. For MVP we'll just save the SVG
// as a fallback and include PNG icon via an inline build-time canvas.

const svg = (size) => `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 ${size} ${size}">
  <defs>
    <linearGradient id="g" x1="0" y1="0" x2="1" y2="1">
      <stop offset="0%" stop-color="#C8B4E8"/>
      <stop offset="50%" stop-color="#F4B8D4"/>
      <stop offset="100%" stop-color="#FFD3B8"/>
    </linearGradient>
  </defs>
  <rect width="${size}" height="${size}" rx="${size * 0.22}" fill="url(#g)"/>
  <text x="50%" y="58%" font-family="Georgia, serif" font-size="${size * 0.5}" font-weight="800" text-anchor="middle" fill="white" letter-spacing="-2">B</text>
</svg>`;

fs.writeFileSync(path.join('public', 'icon-192.svg'), svg(192));
fs.writeFileSync(path.join('public', 'icon-512.svg'), svg(512));
console.log('Wrote SVG icons. Converting to PNG via sips...');
