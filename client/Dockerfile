FROM node:20-alpine
WORKDIR /app
COPY package.json package-lock.json ./
COPY server/package.json server/
COPY client/package.json client/
RUN npm ci --workspace client --include-workspace-root=false
COPY client client
WORKDIR /app/client
ENV API_TARGET=http://server:3001
EXPOSE 5173
CMD ["npm", "run", "dev", "--", "--host", "0.0.0.0"]
