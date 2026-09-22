FROM node:20-slim

# ffmpeg untuk mux video+audio, python3 WAJIB karena binary "yt-dlp" default
# adalah zipapp Python (bukan standalone), curl+ca-certificates untuk download binary yt-dlp
RUN apt-get update && \
    apt-get install -y --no-install-recommends ffmpeg python3 ca-certificates curl unzip && \
    rm -rf /var/lib/apt/lists/*

# yt-dlp (butuh python3 di atas untuk jalan)
RUN curl -L https://github.com/yt-dlp/yt-dlp/releases/latest/download/yt-dlp -o /usr/local/bin/yt-dlp && \
    chmod a+rx /usr/local/bin/yt-dlp

# Deno: dibutuhkan yt-dlp buat nyelesain "n challenge" JS dari YouTube.
# Tanpa ini, sebagian besar format video di-skip (SABR streaming) dan yt-dlp
# gagal dengan error "Requested format is not available".
RUN curl -fsSL https://deno.land/install.sh | sh
ENV PATH="/root/.deno/bin:${PATH}"

WORKDIR /app
COPY package*.json ./
RUN npm install --omit=dev
COPY . .

ENV PORT=10000
EXPOSE 10000

# Pre-fetch komponen EJS (JS challenge solver) lewat npm registry saat build,
# BUKAN lewat --remote-components ejs:github (itu manggil GitHub API yang
# gampang kena rate limit, sama kayak masalah "yt-dlp -U" di startup).
# "|| true" supaya build tidak gagal kalau video test-nya unreachable/berubah.
RUN yt-dlp --remote-components ejs:npm --js-runtimes deno --simulate --no-warnings \
    "https://www.youtube.com/watch?v=jNQXAC9IVRw" || true

# yt-dlp -U diselipkan setiap kali CONTAINER START (bukan cuma build) supaya selalu
# pakai versi terbaru - yt-dlp rilis update hampir tiap minggu buat ngikutin
# perubahan/proteksi baru YouTube. Kalau -U gagal (mis. rate-limit GitHub), tetap lanjut jalan.
CMD ["sh", "-c", "yt-dlp -U || true; node server.js"]
