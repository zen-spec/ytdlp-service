FROM node:20-slim

# ffmpeg untuk mux video+audio, curl+ca-certificates untuk download binary yt-dlp
RUN apt-get update && \
    apt-get install -y --no-install-recommends ffmpeg ca-certificates curl && \
    rm -rf /var/lib/apt/lists/*

# yt-dlp standalone binary (sudah termasuk python, tidak perlu install python terpisah)
RUN curl -L https://github.com/yt-dlp/yt-dlp/releases/latest/download/yt-dlp -o /usr/local/bin/yt-dlp && \
    chmod a+rx /usr/local/bin/yt-dlp

WORKDIR /app
COPY package*.json ./
RUN npm install --omit=dev
COPY . .

ENV PORT=10000
EXPOSE 10000

CMD ["node", "server.js"]
