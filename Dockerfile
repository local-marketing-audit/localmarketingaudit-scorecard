FROM node:20-alpine AS builder

WORKDIR /app

COPY package.json package-lock.json* ./
RUN npm ci

COPY tsconfig.json nest-cli.json ./
COPY src ./src

RUN npm run build

FROM node:20-alpine AS runner

WORKDIR /app

ENV NODE_ENV=production

# Install Ghostscript for PDF compression (font subsetting, image downsampling)
RUN apk add --no-cache ghostscript

COPY package.json package-lock.json* ./
RUN npm ci --omit=dev

COPY --from=builder /app/dist ./dist
COPY src/report/templates ./src/report/templates

EXPOSE 3000

CMD ["node", "dist/main"]
