#!/usr/bin/env node
/**
 * Deterministic pure-Node icon & DMG background asset generator for Nightfall Electron builds.
 * Produces valid multi-resolution PNG, Windows ICO (for WiX .msi), and Apple ICNS (for .dmg)
 * assets in `apps/nightfall-ui/build/` without requiring native image libraries.
 */
import { deflateSync } from 'node:zlib';
import { mkdirSync, writeFileSync } from 'node:fs';
import { dirname, resolve } from 'node:path';

const CRC_TABLE = (() => {
  const table = new Uint32Array(256);
  for (let i = 0; i < 256; i += 1) {
    let c = i;
    for (let k = 0; k < 8; k += 1) {
      c = c & 1 ? 0xedb88320 ^ (c >>> 1) : c >>> 1;
    }
    table[i] = c >>> 0;
  }
  return table;
})();

function crc32(buf) {
  let crc = 0xffffffff;
  for (let i = 0; i < buf.length; i += 1) {
    crc = CRC_TABLE[(crc ^ buf[i]) & 0xff] ^ (crc >>> 8);
  }
  return (crc ^ 0xffffffff) >>> 0;
}

function pngChunk(type, data) {
  const typeBuf = Buffer.from(type, 'ascii');
  const lenBuf = Buffer.alloc(4);
  lenBuf.writeUInt32BE(data.length, 0);
  const crcInput = Buffer.concat([typeBuf, data]);
  const crcBuf = Buffer.alloc(4);
  crcBuf.writeUInt32BE(crc32(crcInput), 0);
  return Buffer.concat([lenBuf, typeBuf, data, crcBuf]);
}

function encodeRgbaPng(width, height, pixelFn) {
  const stride = width * 4 + 1;
  const raw = Buffer.alloc(stride * height);

  for (let y = 0; y < height; y += 1) {
    const rowOffset = y * stride;
    raw[rowOffset] = 0; // filter type 0 (None)
    for (let x = 0; x < width; x += 1) {
      const [r, g, b, a] = pixelFn(x, y, width, height);
      const px = rowOffset + 1 + x * 4;
      raw[px] = r;
      raw[px + 1] = g;
      raw[px + 2] = b;
      raw[px + 3] = a;
    }
  }

  const ihdr = Buffer.alloc(13);
  ihdr.writeUInt32BE(width, 0);
  ihdr.writeUInt32BE(height, 4);
  ihdr[8] = 8; // bit depth
  ihdr[9] = 6; // RGBA
  ihdr[10] = 0;
  ihdr[11] = 0;
  ihdr[12] = 0;

  const compressed = deflateSync(raw, { level: 9 });
  return Buffer.concat([
    Buffer.from([137, 80, 78, 71, 13, 10, 26, 10]),
    pngChunk('IHDR', ihdr),
    pngChunk('IDAT', compressed),
    pngChunk('IEND', Buffer.alloc(0)),
  ]);
}

function renderNightfallEmblemPixel(variant = 'app') {
  const accent = variant === 'installer' ? [99, 102, 241] : [244, 244, 246];
  return (x, y, w, h) => {
    const nx = (x + 0.5) / w;
    const ny = (y + 0.5) / h;
    const pad = 0.08;
    const radius = 0.22;

    // Rounded squircle bounds check
    const minB = pad;
    const maxB = 1 - pad;
    if (nx < minB || nx > maxB || ny < minB || ny > maxB) {
      return [0, 0, 0, 0];
    }
    const cx = nx < minB + radius ? minB + radius : nx > maxB - radius ? maxB - radius : nx;
    const cy = ny < minB + radius ? minB + radius : ny > maxB - radius ? maxB - radius : ny;
    if (Math.hypot(nx - cx, ny - cy) > radius) {
      return [0, 0, 0, 0];
    }

    // Nightfall crescent moon + shield core
    const outerDist = Math.hypot(nx - 0.48, ny - 0.5);
    const innerDist = Math.hypot(nx - 0.58, ny - 0.43);
    if (outerDist <= 0.27 && innerDist >= 0.22) {
      return [accent[0], accent[1], accent[2], 255];
    }

    // Subtle dark slate vertical gradient
    const shade = Math.round(18 + (1 - ny) * 14);
    return [shade, shade + 2, shade + 7, 255];
  };
}

function renderDmgBackgroundPixel(x, y, w, h) {
  const ny = y / h;
  const base = Math.round(246 - ny * 8);
  // Subtle directional arrow between app (x=130) and /Applications (x=410) at y=220
  const dx = x - w / 2;
  const dy = y - 220;
  if (Math.abs(dy) <= 2 && dx >= -48 && dx <= 40) {
    return [140, 145, 158, 255];
  }
  if (dx > 28 && dx <= 48 && Math.abs(dy) <= 48 - dx) {
    return [140, 145, 158, 255];
  }
  return [base, base + 1, base + 3, 255];
}

function encodeIcoFromPngs(entries) {
  const header = Buffer.alloc(6);
  header.writeUInt16LE(0, 0);
  header.writeUInt16LE(1, 2); // type 1 = ICO
  header.writeUInt16LE(entries.length, 4);

  const dirEntries = [];
  let dataOffset = 6 + entries.length * 16;

  for (const { size, png } of entries) {
    const entry = Buffer.alloc(16);
    entry[0] = size >= 256 ? 0 : size;
    entry[1] = size >= 256 ? 0 : size;
    entry[2] = 0;
    entry[3] = 0;
    entry.writeUInt16LE(1, 4); // color planes
    entry.writeUInt16LE(32, 6); // 32 bpp
    entry.writeUInt32LE(png.length, 8);
    entry.writeUInt32LE(dataOffset, 12);
    dirEntries.push(entry);
    dataOffset += png.length;
  }

  return Buffer.concat([header, ...dirEntries, ...entries.map((e) => e.png)]);
}

function encodeIcnsFromPngs(chunks) {
  const encodedChunks = chunks.map(({ osType, png }) => {
    const header = Buffer.alloc(8);
    header.write(osType, 0, 4, 'ascii');
    header.writeUInt32BE(png.length + 8, 4);
    return Buffer.concat([header, png]);
  });
  const totalBytes = 8 + encodedChunks.reduce((acc, buf) => acc + buf.length, 0);
  const fileHeader = Buffer.alloc(8);
  fileHeader.write('icns', 0, 4, 'ascii');
  fileHeader.writeUInt32BE(totalBytes, 4);
  return Buffer.concat([fileHeader, ...encodedChunks]);
}

export function generateDesktopBuildAssets(
  buildDir = resolve(import.meta.dirname, '../apps/nightfall-ui/build'),
) {
  mkdirSync(resolve(buildDir, 'icons'), { recursive: true });

  const app512 = encodeRgbaPng(512, 512, renderNightfallEmblemPixel('app'));
  const app256 = encodeRgbaPng(256, 256, renderNightfallEmblemPixel('app'));
  const app128 = encodeRgbaPng(128, 128, renderNightfallEmblemPixel('app'));
  const app64 = encodeRgbaPng(64, 64, renderNightfallEmblemPixel('app'));
  const app32 = encodeRgbaPng(32, 32, renderNightfallEmblemPixel('app'));
  const app16 = encodeRgbaPng(16, 16, renderNightfallEmblemPixel('app'));

  const installer512 = encodeRgbaPng(512, 512, renderNightfallEmblemPixel('installer'));
  const installer256 = encodeRgbaPng(256, 256, renderNightfallEmblemPixel('installer'));
  const installer128 = encodeRgbaPng(128, 128, renderNightfallEmblemPixel('installer'));
  const installer64 = encodeRgbaPng(64, 64, renderNightfallEmblemPixel('installer'));
  const installer32 = encodeRgbaPng(32, 32, renderNightfallEmblemPixel('installer'));
  const installer16 = encodeRgbaPng(16, 16, renderNightfallEmblemPixel('installer'));

  const dmgBg = encodeRgbaPng(540, 380, renderDmgBackgroundPixel);

  const appIco = encodeIcoFromPngs([
    { size: 256, png: app256 },
    { size: 64, png: app64 },
    { size: 32, png: app32 },
    { size: 16, png: app16 },
  ]);
  const installerIco = encodeIcoFromPngs([
    { size: 256, png: installer256 },
    { size: 64, png: installer64 },
    { size: 32, png: installer32 },
    { size: 16, png: installer16 },
  ]);

  const appIcns = encodeIcnsFromPngs([
    { osType: 'ic09', png: app512 },
    { osType: 'ic08', png: app256 },
    { osType: 'ic07', png: app128 },
  ]);
  const installerIcns = encodeIcnsFromPngs([
    { osType: 'ic09', png: installer512 },
    { osType: 'ic08', png: installer256 },
    { osType: 'ic07', png: installer128 },
  ]);

  const outputs = [
    [resolve(buildDir, 'icon.png'), app512],
    [resolve(buildDir, 'icons/512x512.png'), app512],
    [resolve(buildDir, 'icons/256x256.png'), app256],
    [resolve(buildDir, 'icon_windows.png'), app256],
    [resolve(buildDir, 'icon.ico'), appIco],
    [resolve(buildDir, 'icon_installer.ico'), installerIco],
    [resolve(buildDir, 'icon.icns'), appIcns],
    [resolve(buildDir, 'icon_installer.icns'), installerIcns],
    [resolve(buildDir, 'dmg_background.png'), dmgBg],
  ];

  for (const [targetPath, buffer] of outputs) {
    mkdirSync(dirname(targetPath), { recursive: true });
    writeFileSync(targetPath, buffer);
  }

  return outputs.map(([targetPath, buffer]) => ({ path: targetPath, bytes: buffer.length }));
}

if (import.meta.url === `file://${process.argv[1]}`) {
  const written = generateDesktopBuildAssets();
  console.log(`[generate-desktop-icons] Generated ${written.length} desktop icon/DMG assets.`);
}
