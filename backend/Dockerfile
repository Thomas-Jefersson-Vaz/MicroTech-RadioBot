FROM node:24-alpine
ARG YTDLP_VERSION=2026.08.19
RUN apk add --no-cache python3 ffmpeg && \
    wget -qO /usr/local/bin/yt-dlp "https://github.com/yt-dlp/yt-dlp/releases/download/${YTDLP_VERSION}/yt-dlp" && \
    chmod +x /usr/local/bin/yt-dlp
WORKDIR /app
COPY package*.json ./
RUN npm ci --omit=dev
COPY . .
ENV NODE_ENV=production
EXPOSE 3000
USER node
CMD ["node","src/index.js"]
