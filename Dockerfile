FROM node:20-slim

# ffmpeg untuk mux video+audio, python3 WAJIB karena binary "yt-dlp" default
# adalah zipapp Python (bukan standalone), curl+ca-certificates untuk download binary yt-dlp
RUN apt-get update && \
    apt-get install -y --no-install-recommends ffmpeg python3 ca-certificates curl && \
    rm -rf /var/lib/apt/lists/*

# yt-dlp (butuh python3 di atas untuk jalan)
RUN curl -L https://github.com/yt-dlp/yt-dlp/releases/latest/download/yt-dlp -o /usr/local/bin/yt-dlp && \
    chmod a+rx /usr/local/bin/yt-dlp

WORKDIR /app
COPY package*.json ./
RUN npm install --omit=dev
COPY . .

ENV PORT=10000
EXPOSE 10000

CMD ["node", "server.js"]
