// Static QR code rendering, offline. No network access.
import qrcode from 'qrcode-generator';

export const MAX_LENGTH = 2000;
const QUIET_ZONE = 4; // modules of white margin required by the QR specification
const LEVELS = ['L', 'M', 'Q', 'H'];

// Byte mode reads qrcode.stringToBytes at encoding time; the library default keeps only the low
// byte of each UTF-16 unit, which corrupts accents and emoji. Encode as UTF-8 instead.
const utf8 = new TextEncoder();
qrcode.stringToBytes = (s) => Array.from(utf8.encode(s));

/**
 * QR code of `text` as an SVG string.
 * @param {string} text
 * @param {{ errorCorrection?: 'L'|'M'|'Q'|'H', foreground?: string, background?: string, size?: number }} [opts]
 */
export function qrSvg(text, opts = {}) {
  if (typeof text !== 'string' || !text.length) throw new Error('text is required.');
  if (text.length > MAX_LENGTH) throw new Error(`text is too long (${text.length} characters, ${MAX_LENGTH} at most).`);
  const level = LEVELS.includes(opts.errorCorrection) ? opts.errorCorrection : 'M';
  const fg = safeColor(opts.foreground, '#000000');
  const bg = safeColor(opts.background, '#ffffff');

  const qr = qrcode(0, level);
  qr.addData(text, 'Byte');
  qr.make();

  const count = qr.getModuleCount();
  const dim = count + QUIET_ZONE * 2;
  let d = '';
  for (let r = 0; r < count; r++) {
    for (let c = 0; c < count; c++) {
      if (qr.isDark(r, c)) d += `M${c + QUIET_ZONE} ${r + QUIET_ZONE}h1v1h-1z`;
    }
  }
  const px = Number.isInteger(opts.size) && opts.size >= 64 && opts.size <= 4096 ? opts.size : 512;
  const svg =
    `<svg xmlns="http://www.w3.org/2000/svg" width="${px}" height="${px}" viewBox="0 0 ${dim} ${dim}" shape-rendering="crispEdges">` +
    `<rect width="${dim}" height="${dim}" fill="${bg}"/><path d="${d}" fill="${fg}"/></svg>`;
  return { svg, modules: count, errorCorrection: level };
}

function safeColor(value, fallback) {
  return typeof value === 'string' && /^#(?:[0-9a-f]{3}|[0-9a-f]{6})$/i.test(value) ? value : fallback;
}
