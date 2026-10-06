FROM node:24-alpine AS builder
WORKDIR /app
COPY package*.json ./
RUN npm ci
COPY . .
ENV NEXT_TELEMETRY_DISABLED=1
RUN npm run build
FROM node:24-alpine AS runner
WORKDIR /app
ENV NODE_ENV=production NEXT_TELEMETRY_DISABLED=1
COPY --from=builder /app/.next/standalone ./
COPY --from=builder /app/proxy.cjs ./proxy.cjs
ENV FRONTEND_PORT=3001 NEXT_INTERNAL_PORT=3002
EXPOSE 3001
USER node
CMD ["node","proxy.cjs"]
