# Chromium is in the image rather than downloaded at boot: the PDF is printed
# from the same HTML the web report renders, and a browser is the only thing
# that can do that faithfully. It is the one heavy dependency in the project.
FROM mcr.microsoft.com/playwright:v1.56.0-noble

WORKDIR /app
ENV NODE_ENV=production
ENV PULSE_DATA_DIR=/data/runs

COPY package.json package-lock.json ./
RUN npm ci --omit=dev

COPY src ./src
COPY plugin ./plugin
COPY scripts ./scripts
COPY tsconfig.json ./

EXPOSE 3001
CMD ["node", "--experimental-strip-types", "src/server/main.ts"]
