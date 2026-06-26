/*
 * Brand asset generator for The Confession Hub.
 *
 * Produces every logo/icon from one source of truth so the branding can be
 * tweaked in one place. Run with:  node scripts/gen-logo.js
 *
 * Outputs (all under apps/web/public):
 *   logo.svg      realistic emblem (halo coin + laurel + open book + gold cross)
 *   icon.svg      full-bleed emblem (no transparent corners) for app icons
 *   favicon.svg   simplified book+cross (legible at 16-32px; no laurel)
 *   ogLogo.svg    1200x630 social card: emblem + wordmark on dark green
 *   logo.png / ogLogo.png / favicon-16x16 / favicon-32x32 / favicon.ico /
 *   apple-touch-icon.png / android-chrome-192x192.png / android-chrome-512x512.png
 *
 * Tweak the palette / TAGLINE / FONT constants below, then re-run.
 */
const fs = require("fs");
const path = require("path");
const sharp = require("sharp");

const xml = (s) => s.replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;");
const PUBLIC = path.join(__dirname, "..", "public");
const TAGLINE = "Read & study historic Christian confessions";
const URL_TEXT = "confess.catechize.ing";
const FONT = "Georgia, 'Times New Roman', serif";
const GOLD = "#c8a44d"; // brand gold used in the wordmark + rules
const DENSITY = 700; // rasterization density for crisp downscales

// ---- laurel wreath geometry ----
const cx = 100, cy = 106, R = 70;
const deg = (a) => (a * Math.PI) / 180;
const leaf = (a, r, rot, rx, ry) => {
  const x = cx + r * Math.cos(deg(a));
  const y = cy + r * Math.sin(deg(a));
  return `<ellipse cx="${x.toFixed(1)}" cy="${y.toFixed(1)}" rx="${rx}" ry="${ry}" transform="rotate(${rot.toFixed(1)} ${x.toFixed(1)} ${y.toFixed(1)})"/>`;
};
const branchPath = (r, a0, a1) => {
  const x0 = cx + r * Math.cos(deg(a0)), y0 = cy + r * Math.sin(deg(a0));
  const x1 = cx + r * Math.cos(deg(a1)), y1 = cy + r * Math.sin(deg(a1));
  const large = Math.abs(a1 - a0) > 180 ? 1 : 0;
  const sweep = a1 > a0 ? 1 : 0;
  return `M ${x0.toFixed(1)} ${y0.toFixed(1)} A ${r} ${r} 0 ${large} ${sweep} ${x1.toFixed(1)} ${y1.toFixed(1)}`;
};
const buildBranch = (angles, mirror) =>
  angles
    .map(
      (a) =>
        leaf(a, R + 3, a + (mirror ? 90 - 28 : 90 + 28), 9.5, 4.2) +
        leaf(a - (mirror ? -6 : 6), R - 9, a + (mirror ? 90 + 22 : 90 - 22), 8, 3.6)
    )
    .join("");
const leftAngles = [];
for (let a = 96; a <= 234; a += 15.5) leftAngles.push(a);
const rightAngles = leftAngles.map((a) => 180 - a);

const DEFS = `
    <radialGradient id="halo" cx="50%" cy="40%" r="58%">
      <stop offset="0%" stop-color="#fdf6df"/><stop offset="58%" stop-color="#f1e9d0"/><stop offset="100%" stop-color="#e6ecdd"/>
    </radialGradient>
    <linearGradient id="cover" x1="0" y1="0" x2="0" y2="1"><stop offset="0%" stop-color="#3c6e47"/><stop offset="100%" stop-color="#193524"/></linearGradient>
    <linearGradient id="page" x1="0" y1="0" x2="0" y2="1"><stop offset="0%" stop-color="#ffffff"/><stop offset="100%" stop-color="#e2ddca"/></linearGradient>
    <linearGradient id="pageR" x1="0" y1="0" x2="0" y2="1"><stop offset="0%" stop-color="#f6f2e4"/><stop offset="100%" stop-color="#d6d0bb"/></linearGradient>
    <linearGradient id="gold" x1="0" y1="0" x2="0.3" y2="1"><stop offset="0%" stop-color="#f6e09a"/><stop offset="42%" stop-color="#d7ad4c"/><stop offset="100%" stop-color="#9f7327"/></linearGradient>
    <linearGradient id="leaf" x1="0" y1="0" x2="1" y2="1"><stop offset="0%" stop-color="#4c7d51"/><stop offset="100%" stop-color="#274a30"/></linearGradient>
    <linearGradient id="leafR" x1="0" y1="0" x2="1" y2="1"><stop offset="0%" stop-color="#3f6e45"/><stop offset="100%" stop-color="#1f3f28"/></linearGradient>
    <filter id="soft" x="-30%" y="-30%" width="160%" height="160%"><feDropShadow dx="0" dy="2" stdDeviation="2.2" flood-color="#16241a" flood-opacity="0.3"/></filter>`;

const emblemCore = (withHalo) => `
  ${withHalo ? `<circle cx="100" cy="100" r="96" fill="url(#halo)" stroke="#cdb15e" stroke-width="2.5"/>
  <circle cx="100" cy="100" r="92.5" fill="none" stroke="#ffffff" stroke-width="1" opacity="0.45"/>` : ""}
  <g opacity="0.55" stroke="#e6c878" stroke-width="2.4" stroke-linecap="round">
    <line x1="100" y1="30" x2="100" y2="18"/><line x1="80" y1="33" x2="75" y2="22"/><line x1="120" y1="33" x2="125" y2="22"/>
    <line x1="63" y1="42" x2="55" y2="33"/><line x1="137" y1="42" x2="145" y2="33"/>
  </g>
  <g filter="url(#soft)">
    <path d="${branchPath(R, 96, 234)}" fill="none" stroke="#2f5638" stroke-width="3" stroke-linecap="round"/>
    <g fill="url(#leaf)">${buildBranch(leftAngles, false)}</g>
    <path d="${branchPath(R, 84, -54)}" fill="none" stroke="#2f5638" stroke-width="3" stroke-linecap="round"/>
    <g fill="url(#leafR)">${buildBranch(rightAngles, true)}</g>
  </g>
  <g filter="url(#soft)">
    <path d="M100 92 C 78 81 56 81 40 89 L 36 150 C 56 141 78 141 100 152 C 122 141 144 141 164 150 L 160 89 C 144 81 122 81 100 92 Z" fill="url(#cover)"/>
    <path d="M40 140 C 60 131 80 131 100 142 C 120 131 140 131 160 140 L 160 146 C 140 136 120 136 100 147 C 80 136 60 136 40 146 Z" fill="#cec8b2"/>
    <path d="M100 98 C 80 88 58 88 43 95 L 40 140 C 58 132 80 132 100 142 Z" fill="url(#page)"/>
    <path d="M100 98 C 120 88 142 88 157 95 L 160 140 C 142 132 120 132 100 142 Z" fill="url(#pageR)"/>
    <path d="M100 98 L 100 142" stroke="#b6b09a" stroke-width="2.2" opacity="0.6"/>
    <g stroke="#9aa089" stroke-width="1.9" stroke-linecap="round" opacity="0.5">
      <line x1="52" y1="105" x2="90" y2="108"/><line x1="50" y1="113" x2="90" y2="116"/><line x1="49" y1="121" x2="90" y2="124"/>
      <line x1="110" y1="108" x2="148" y2="105"/><line x1="110" y1="116" x2="150" y2="113"/><line x1="110" y1="124" x2="151" y2="121"/>
    </g>
  </g>
  <g filter="url(#soft)">
    <path d="M93 50 h14 v18 h18 v14 h-18 v26 h-14 v-26 h-18 v-14 h18 z" fill="url(#gold)" stroke="#876020" stroke-width="1.1"/>
    <path d="M95.5 52.5 h3.5 v50 h-3.5 z" fill="#fbe7b0" opacity="0.5"/>
  </g>`;

const logoSvg = `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 200 200" role="img" aria-label="The Confession Hub">
  <title>The Confession Hub</title>
  <defs>${DEFS}</defs>${emblemCore(true)}
</svg>
`;

const iconSvg = `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 200 200" role="img" aria-label="The Confession Hub">
  <title>The Confession Hub</title>
  <defs>${DEFS}</defs>
  <rect width="200" height="200" fill="url(#halo)"/>${emblemCore(false)}
</svg>
`;

const faviconSvg = `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 64 64" role="img" aria-label="The Confession Hub">
  <title>The Confession Hub</title>
  <defs>
    <radialGradient id="fhalo" cx="50%" cy="42%" r="60%"><stop offset="0%" stop-color="#fdf6df"/><stop offset="100%" stop-color="#e9efdd"/></radialGradient>
    <linearGradient id="fcover" x1="0" y1="0" x2="0" y2="1"><stop offset="0%" stop-color="#3c6e47"/><stop offset="100%" stop-color="#193524"/></linearGradient>
    <linearGradient id="fpage" x1="0" y1="0" x2="0" y2="1"><stop offset="0%" stop-color="#ffffff"/><stop offset="100%" stop-color="#e2ddca"/></linearGradient>
    <linearGradient id="fpageR" x1="0" y1="0" x2="0" y2="1"><stop offset="0%" stop-color="#f4f0e2"/><stop offset="100%" stop-color="#d6d0bb"/></linearGradient>
    <linearGradient id="fgold" x1="0" y1="0" x2="0.3" y2="1"><stop offset="0%" stop-color="#f6e09a"/><stop offset="42%" stop-color="#d7ad4c"/><stop offset="100%" stop-color="#9f7327"/></linearGradient>
  </defs>
  <rect width="64" height="64" fill="url(#fhalo)"/>
  <path d="M28 5 h8 v9 h9 v8 h-9 v12 h-8 v-12 h-9 v-8 h9 z" fill="url(#fgold)" stroke="#876020" stroke-width="0.8"/>
  <path d="M32 28 C 21 22 9 22 4 25 L 4 54 C 9 51 21 51 32 57 C 43 51 55 51 60 54 L 60 25 C 55 22 43 22 32 28 Z" fill="url(#fcover)"/>
  <path d="M32 32 C 22 27 11 27 6 30 L 6 50 C 11 47 22 47 32 52 Z" fill="url(#fpage)"/>
  <path d="M32 32 C 42 27 53 27 58 30 L 58 50 C 53 47 42 47 32 52 Z" fill="url(#fpageR)"/>
  <path d="M32 32 L 32 52" stroke="#b6b09a" stroke-width="1.4" opacity="0.6"/>
  <g stroke="#9aa089" stroke-width="1.5" stroke-linecap="round" opacity="0.55">
    <line x1="11" y1="36" x2="27" y2="38"/><line x1="11" y1="41" x2="27" y2="43"/><line x1="11" y1="46" x2="27" y2="48"/>
    <line x1="37" y1="38" x2="53" y2="36"/><line x1="37" y1="43" x2="53" y2="41"/><line x1="37" y1="48" x2="53" y2="46"/>
  </g>
</svg>
`;

const ogSvg = `<svg xmlns="http://www.w3.org/2000/svg" width="1200" height="630" viewBox="0 0 1200 630" role="img" aria-label="The Confession Hub — ${xml(TAGLINE)}">
  <title>The Confession Hub</title>
  <defs>${DEFS}
    <radialGradient id="bg" cx="50%" cy="36%" r="80%"><stop offset="0%" stop-color="#1d3a29"/><stop offset="100%" stop-color="#11231a"/></radialGradient>
  </defs>
  <rect width="1200" height="630" fill="url(#bg)"/>
  <rect x="28" y="28" width="1144" height="574" rx="22" fill="none" stroke="#3a5d45" stroke-width="2"/>
  <rect x="36" y="36" width="1128" height="558" rx="18" fill="none" stroke="${GOLD}" stroke-width="1" opacity="0.45"/>
  <g transform="translate(70, 143) scale(1.72)">${emblemCore(true)}</g>
  <g>
    <text x="700" y="250" font-family="${FONT}" font-size="36" letter-spacing="16" fill="${GOLD}" text-anchor="middle">THE</text>
    <text x="700" y="356" font-family="${FONT}" font-size="100" font-weight="700" fill="#f3f0e3" text-anchor="middle">Confession</text>
    <text x="700" y="452" font-family="${FONT}" font-size="100" font-weight="700" fill="#f3f0e3" text-anchor="middle">Hub</text>
    <line x1="556" y1="492" x2="844" y2="492" stroke="${GOLD}" stroke-width="1.5" opacity="0.7"/>
    <text x="700" y="528" font-family="${FONT}" font-size="30" fill="#a9c6a9" text-anchor="middle">${xml(TAGLINE)}</text>
    <text x="700" y="566" font-family="${FONT}" font-size="26" letter-spacing="2" fill="${GOLD}" text-anchor="middle">${xml(URL_TEXT)}</text>
  </g>
</svg>
`;

// Tight horizontal brand lockup for on-site use (emblem + wordmark, no dead
// space). Same look as the social card, cropped so it works as the logo.
const lockupSvg = `<svg xmlns="http://www.w3.org/2000/svg" width="1080" height="380" viewBox="0 0 1080 380" role="img" aria-label="The Confession Hub — ${xml(TAGLINE)}">
  <title>The Confession Hub</title>
  <defs>${DEFS}
    <radialGradient id="bg" cx="38%" cy="30%" r="92%"><stop offset="0%" stop-color="#1d3a29"/><stop offset="100%" stop-color="#11231a"/></radialGradient>
  </defs>
  <rect width="1080" height="380" rx="30" fill="url(#bg)"/>
  <rect x="11" y="11" width="1058" height="358" rx="23" fill="none" stroke="${GOLD}" stroke-width="1.5" opacity="0.5"/>
  <g transform="translate(40, 40) scale(1.5)">${emblemCore(true)}</g>
  <g>
    <text x="708" y="132" font-family="${FONT}" font-size="30" letter-spacing="14" fill="${GOLD}" text-anchor="middle">THE</text>
    <text x="708" y="222" font-family="${FONT}" font-size="86" font-weight="700" fill="#f3f0e3" text-anchor="middle">Confession Hub</text>
    <line x1="478" y1="258" x2="938" y2="258" stroke="${GOLD}" stroke-width="1.5" opacity="0.65"/>
    <text x="708" y="298" font-family="${FONT}" font-size="27" fill="#a9c6a9" text-anchor="middle">${xml(TAGLINE)}</text>
    <text x="708" y="336" font-family="${FONT}" font-size="23" letter-spacing="2" fill="${GOLD}" text-anchor="middle">${xml(URL_TEXT)}</text>
  </g>
</svg>
`;

function buildIco(pngs) {
  const n = pngs.length;
  const header = Buffer.alloc(6);
  header.writeUInt16LE(0, 0);
  header.writeUInt16LE(1, 2);
  header.writeUInt16LE(n, 4);
  const entries = [];
  const datas = [];
  let offset = 6 + 16 * n;
  for (const { size, buf } of pngs) {
    const e = Buffer.alloc(16);
    e.writeUInt8(size >= 256 ? 0 : size, 0);
    e.writeUInt8(size >= 256 ? 0 : size, 1);
    e.writeUInt16LE(1, 4);
    e.writeUInt16LE(32, 6);
    e.writeUInt32LE(buf.length, 8);
    e.writeUInt32LE(offset, 12);
    offset += buf.length;
    entries.push(e);
    datas.push(buf);
  }
  return Buffer.concat([header, ...entries, ...datas]);
}

const out = (name) => path.join(PUBLIC, name);
const png = (svg, size) => sharp(Buffer.from(svg), { density: DENSITY }).resize(size, size).png();

(async () => {
  fs.writeFileSync(out("logo.svg"), logoSvg);
  fs.writeFileSync(out("icon.svg"), iconSvg);
  fs.writeFileSync(out("favicon.svg"), faviconSvg);
  fs.writeFileSync(out("ogLogo.svg"), ogSvg);
  fs.writeFileSync(out("lockup.svg"), lockupSvg);

  // header/footer raster fallback
  await png(logoSvg, 512).toFile(out("logo.png"));
  // lockup raster fallback (transparent corners around the rounded card)
  await sharp(Buffer.from(lockupSvg), { density: 300 }).png().toFile(out("lockup.png"));

  // app icons from full-bleed emblem
  await png(iconSvg, 180).toFile(out("apple-touch-icon.png"));
  await png(iconSvg, 192).toFile(out("android-chrome-192x192.png"));
  await png(iconSvg, 512).toFile(out("android-chrome-512x512.png"));

  // favicons from the simplified mark
  await png(faviconSvg, 16).toFile(out("favicon-16x16.png"));
  await png(faviconSvg, 32).toFile(out("favicon-32x32.png"));
  const i16 = await png(faviconSvg, 16).toBuffer();
  const i32 = await png(faviconSvg, 32).toBuffer();
  const i48 = await png(faviconSvg, 48).toBuffer();
  fs.writeFileSync(out("favicon.ico"), buildIco([
    { size: 16, buf: i16 },
    { size: 32, buf: i32 },
    { size: 48, buf: i48 },
  ]));

  // social card
  await sharp(Buffer.from(ogSvg), { density: 144 }).png().toFile(out("ogLogo.png"));

  console.log("Brand assets regenerated in apps/web/public");
})();
