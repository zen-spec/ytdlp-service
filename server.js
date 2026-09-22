const express = require('express');
const cors = require('cors');
const { spawn, execFile } = require('child_process');
const fs = require('fs');
const path = require('path');

const app = express();
app.use(cors());

const PORT = process.env.PORT || 10000;
// WAJIB diisi di Render > Environment. Ini kunci supaya microservice tidak
// bisa dipakai sembarang orang yang nebak-nebak URL-nya.
const API_KEY = process.env.API_KEY || '';

// --- Cookies YouTube (isi base64 dari file cookies.txt, di-set lewat env var Render) ---
// Dipakai supaya yt-dlp tidak kena "Sign in to confirm you're not a bot" karena IP datacenter.
const COOKIES_PATH = path.join(__dirname, 'cookies.txt');
if (process.env.YTDLP_COOKIES_B64) {
  try {
    fs.writeFileSync(COOKIES_PATH, Buffer.from(process.env.YTDLP_COOKIES_B64, 'base64').toString('utf8'));
    console.log('cookies.txt berhasil ditulis dari env var YTDLP_COOKIES_B64');
  } catch (e) {
    console.error('Gagal menulis cookies.txt:', e.message);
  }
}
const hasCookies = fs.existsSync(COOKIES_PATH);
function cookieArgs() {
  return hasCookies ? ['--cookies', COOKIES_PATH] : [];
}

function checkAuth(req, res) {
  if (!API_KEY) return true; // kalau tidak diset -> service terbuka, TIDAK disarankan untuk production
  const key = req.query.key || req.headers['x-api-key'];
  if (key !== API_KEY) {
    res.status(401).json({ status: false, message: 'API key salah atau tidak ada' });
    return false;
  }
  return true;
}

function ytDlpInfo(url) {
  return new Promise((resolve, reject) => {
    execFile(
      'yt-dlp',
      [
        '-j', '--no-playlist', '--no-warnings',
        // Coba beberapa client sekaligus; yt-dlp otomatis pilih yang formatnya lengkap.
        // Client mana yang "aman" dari SABR/PO-Token berubah-ubah seiring update YouTube.
        '--extractor-args', 'youtube:player_client=tv,android,web_safari',
        ...cookieArgs(),
        url
      ],
      { maxBuffer: 1024 * 1024 * 20, timeout: 60000 },
      (err, stdout, stderr) => {
        if (err) {
          if (stderr) console.error('yt-dlp stderr:', stderr.slice(0, 2000));
          return reject(err);
        }
        try { resolve(JSON.parse(stdout)); }
        catch (e) { reject(e); }
      }
    );
  });
}

app.get('/health', (req, res) => {
  res.json({ status: true, message: 'yt-dlp microservice aktif', cookiesLoaded: hasCookies });
});

// GET /info?url=<youtube_url>&key=<API_KEY>
app.get('/info', async (req, res) => {
  if (!checkAuth(req, res)) return;
  const { url } = req.query;
  if (!url) return res.status(400).json({ status: false, message: 'url kosong' });

  try {
    const info = await ytDlpInfo(url);
    const availableHeights = [...new Set(
      (info.formats || [])
        .filter(f => f.vcodec && f.vcodec !== 'none' && f.height)
        .map(f => f.height)
    )];
    res.json({
      status: true,
      title: info.title,
      duration: info.duration,
      thumbnail: info.thumbnail,
      uploader: info.uploader || info.channel,
      availableHeights
    });
  } catch (e) {
    console.error('yt-dlp info error:', e.message);
    res.status(500).json({ status: false, message: 'yt-dlp info error: ' + e.message });
  }
});

// GET /stream?url=<youtube_url>&quality=1080|720|360|audio&title=<judul>&key=<API_KEY>
// Stream langsung: yt-dlp -> ffmpeg mux -> stdout -> response, tanpa nyimpen file di disk.
app.get('/stream', (req, res) => {
  if (!checkAuth(req, res)) return;
  const { url, quality, title } = req.query;
  if (!url) return res.status(400).send('url kosong');

  const isAudio = quality === 'audio';
  const safeTitle = (title || 'video').replace(/[\/\\?%*:|"<>]/g, '').trim() || 'video';
  const format = isAudio
    ? 'bestaudio[ext=m4a]/bestaudio'
    : `bestvideo[height<=${parseInt(quality) || 720}][ext=mp4]+bestaudio[ext=m4a]/best[height<=${parseInt(quality) || 720}]`;

  res.setHeader('Content-Disposition', `attachment; filename="${safeTitle}.${isAudio ? 'm4a' : 'mp4'}"`);
  res.setHeader('Content-Type', isAudio ? 'audio/mp4' : 'video/mp4');

  const args = [
    '-f', format,
    '--no-playlist',
    '--no-warnings',
    '--extractor-args', 'youtube:player_client=tv,android,web_safari',
    '--merge-output-format', 'mp4',
    ...cookieArgs(),
    '-o', '-',
    url
  ];

  const proc = spawn('yt-dlp', args);
  let responded = false;

  proc.stdout.pipe(res);
  proc.stderr.on('data', (d) => console.log('[yt-dlp]', d.toString().slice(0, 300)));

  proc.on('error', (err) => {
    console.error('yt-dlp spawn error:', err.message);
    if (!responded && !res.headersSent) {
      responded = true;
      res.status(500).send('yt-dlp gagal dijalankan di microservice.');
    }
  });

  proc.on('close', (code) => {
    if (code !== 0) console.log(`yt-dlp exit code ${code}`);
    if (!res.writableEnded) res.end();
  });

  req.on('close', () => {
    if (!proc.killed) proc.kill('SIGKILL');
  });
});

app.listen(PORT, '0.0.0.0', () => {
  console.log(`yt-dlp microservice jalan di port ${PORT}`);
});
