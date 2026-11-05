FROM node:22-slim
WORKDIR /app
ENV NODE_ENV=production DATA_DIR=/data PORT=3000
COPY package.json package-lock.json ./
RUN npm ci --omit=dev --no-audit --no-fund
COPY . .
RUN mkdir -p /data && chown node:node /data
USER node
EXPOSE 3000
CMD ["node", "--disable-warning=ExperimentalWarning", "index.mjs"]
