FROM node:20-alpine
WORKDIR /app
COPY package.json package-lock.json ./
COPY server/package.json server/
COPY client/package.json client/
RUN npm ci --workspace server --include-workspace-root=false
COPY server server
WORKDIR /app/server
ENV DATA_DIR=/app/data PORT=3001
EXPOSE 3001
CMD ["npm", "run", "dev"]
