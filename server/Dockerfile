# ==========================================================================
# Imagem do server BarberMan para o Render (Node puro)
# ==========================================================================
# Sem WhatsApp/Chromium: o server é leve e roda tranquilo no plano grátis.
# ==========================================================================
FROM node:20-slim

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
