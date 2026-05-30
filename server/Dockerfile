# ==========================================================================
# Imagem do server BarberMan para o Render (Node + Chromium para o WhatsApp)
# ==========================================================================
# O whatsapp-web.js controla um Chromium headless via Puppeteer. Em vez de
# baixar o Chromium do Puppeteer, instalamos o Chromium do sistema e suas
# bibliotecas — mais leve e estável em produção.
# ==========================================================================
FROM node:20-slim

# Chromium + bibliotecas exigidas pelo navegador headless.
RUN apt-get update && apt-get install -y --no-install-recommends \
    chromium \
    ca-certificates \
    fonts-liberation \
    libnss3 \
    libatk1.0-0 \
    libatk-bridge2.0-0 \
    libcups2 \
    libdrm2 \
    libxkbcommon0 \
    libxcomposite1 \
    libxdamage1 \
    libxfixes3 \
    libxrandr2 \
    libgbm1 \
    libasound2 \
    libpangocairo-1.0-0 \
    libpango-1.0-0 \
    libgtk-3-0 \
  && rm -rf /var/lib/apt/lists/*

# Usa o Chromium do sistema (não baixar o do Puppeteer).
ENV PUPPETEER_SKIP_DOWNLOAD=true
ENV PUPPETEER_EXECUTABLE_PATH=/usr/bin/chromium
ENV NODE_ENV=production

WORKDIR /app

# Instala dependências primeiro (melhor cache de build).
COPY package*.json ./
RUN npm install --omit=dev

# Código da aplicação.
COPY . .

# O Render injeta a porta via env PORT; o server já lê process.env.PORT.
EXPOSE 4000

CMD ["npm", "start"]
