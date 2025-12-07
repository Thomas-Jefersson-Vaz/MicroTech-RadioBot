FROM node:20-alpine

# Install system dependencies
# ffmpeg: required for audio playback
# python3: required by yt-dlp
# build-base: required for compiling native node modules (sodium-native, etc.)
RUN apk add --no-cache ffmpeg python3 build-base

WORKDIR /app
RUN mkdir -p /app/data

COPY package*.json ./

RUN npm install

COPY . .

# Ensure the app has permissions to write the binary if it downloads it
RUN chmod -R 777 /app

# Expose not needed for standalone bot

CMD ["npm", "start"]
