const sharp = require('sharp');
const fs = require('fs');

// 紫色方向的「色度单位向量」（相对亮度的通道偏移），由目标色 #9a63d8 反推
const TC = [0.62, 0.36, 0.90];
const TL = 0.299 * TC[0] + 0.587 * TC[1] + 0.114 * TC[2];
let U = [TC[0] - TL, TC[1] - TL, TC[2] - TL];
const UL = Math.hypot(...U);
U = U.map((v) => v / UL);

const SAT_K = Number(process.argv[2] || 1.25);   // 饱和度放大
const SAT_BASE = Number(process.argv[3] || 0.075); // 灰白区域的最低紫度（肚皮）
const out = process.argv[4] || '.tmp-tex/purple-fixed.webp';

(async () => {
  const { data, info } = await sharp('.tmp-tex/player-0.webp').removeAlpha().raw()
    .toBuffer({ resolveWithObject: true });
  const n = info.width * info.height;
  const buf = Buffer.alloc(n * 3);
  for (let i = 0; i < n; i++) {
    const o = i * 3;
    const r = data[o] / 255, g = data[o + 1] / 255, b = data[o + 2] / 255;
    const L = 0.299 * r + 0.587 * g + 0.114 * b;
    const len = Math.hypot(r - L, g - L, b - L);
    // 高光处收敛一点，免得亮部被钳成死白
    const damp = 1 - Math.max(0, L - 0.72) / 0.28 * 0.55;
    // SAT_BASE 是「灰白区域（肚皮）也至少带这么多紫」的下限。
    // 0.075 时肚皮几乎是奶白 —— 用户要的是「浅紫肚」，得抬到 0.16 才看得出紫。
    const s = Math.max(len * SAT_K, SAT_BASE) * damp;
    const nr = L + U[0] * s, ng = L + U[1] * s, nb = L + U[2] * s;
    buf[o]     = Math.max(0, Math.min(255, Math.round(nr * 255)));
    buf[o + 1] = Math.max(0, Math.min(255, Math.round(ng * 255)));
    buf[o + 2] = Math.max(0, Math.min(255, Math.round(nb * 255)));
  }
  await sharp(buf, { raw: { width: info.width, height: info.height, channels: 3 } })
    .webp({ quality: 92 }).toFile(out);
  console.log('wrote', out);
})();
