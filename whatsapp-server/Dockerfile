FROM node:20-alpine

WORKDIR /app

COPY package*.json ./
RUN npm install --omit=dev

COPY . .

# Persisted across container restarts so you don't have to re-scan the QR code every deploy —
# mount this as a volume in production (see README.md).
VOLUME ["/app/auth_session"]

EXPOSE 4000

CMD ["node", "index.js"]
