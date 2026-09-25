// Usage:
//   node render-video.js                 -> canyon-walk.mp4 + canyon-walk-with-music.mp4
//   node render-video.js --stills 5,40   -> stills/t-5.png, stills/t-40.png
const { spawn, spawnSync } = require('child_process');
const fs = require('fs');
const path = require('path');
const R = require('./renderer.js');

const FPS = 30, SCALE = 10;
const dir = __dirname;
const rgb = Buffer.alloc(R.W * R.H * 3);

function ffmpeg(args, input) {
  const r = spawnSync('ffmpeg', ['-hide_banner', '-loglevel', 'error', '-y', ...args], { input });
  if (r.status !== 0) throw new Error(r.stderr.toString());
}

function stills(times) {
  fs.mkdirSync(path.join(dir, 'stills'), { recursive: true });
  for (const t of times) {
    R.renderFrame(t); R.toRGB(rgb);
    ffmpeg(['-f', 'rawvideo', '-pix_fmt', 'rgb24', '-s', `${R.W}x${R.H}`, '-i', '-',
      '-vf', `scale=${R.W * 4}:${R.H * 4}:flags=neighbor`, path.join(dir, 'stills', `t-${t}.png`)], rgb);
  }
}

async function video() {
  const silent = path.join(dir, 'canyon-walk.mp4');
  const frames = Math.ceil(R.DURATION * FPS);
  const ff = spawn('ffmpeg', ['-hide_banner', '-loglevel', 'error', '-y',
    '-f', 'rawvideo', '-pix_fmt', 'rgb24', '-s', `${R.W}x${R.H}`, '-r', String(FPS), '-i', '-',
    '-vf', `scale=${R.W * SCALE}:${R.H * SCALE}:flags=neighbor`,
    '-c:v', 'libx264', '-preset', 'slow', '-crf', '14', '-pix_fmt', 'yuv420p', silent], { stdio: ['pipe', 'inherit', 'inherit'] });
  const done = new Promise((res, rej) => ff.on('close', c => (c === 0 ? res() : rej(new Error('ffmpeg exit ' + c)))));
  for (let i = 0; i < frames; i++) {
    R.renderFrame(i / FPS); R.toRGB(rgb);
    if (!ff.stdin.write(rgb)) await new Promise(r => ff.stdin.once('drain', r));
  }
  ff.stdin.end();
  await done;
  ffmpeg(['-i', silent, '-i', path.join(dir, 'combined-sequences-1.mp3'),
    '-c:v', 'copy', '-c:a', 'aac', '-b:a', '192k', '-shortest', path.join(dir, 'canyon-walk-with-music.mp4')]);
  console.log(`rendered ${frames} frames -> canyon-walk.mp4, canyon-walk-with-music.mp4`);
}

const si = process.argv.indexOf('--stills');
if (si > 0) stills(process.argv[si + 1].split(',').map(Number));
else video().catch(e => { console.error(e); process.exit(1); });
