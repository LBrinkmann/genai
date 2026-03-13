FROM node:22-slim AS dev

WORKDIR /app

COPY package.json package-lock.json* ./

RUN npm install

COPY . .

CMD ["npm", "start"]

# --- Build stage -----------------------------------------------------
FROM node:22-slim AS build

WORKDIR /app

COPY package.json package-lock.json* ./

RUN npm install

COPY . .

RUN npm run build

# --- Production stage (static files only) ----------------------------
FROM scratch AS prod

COPY --from=build /app/build /app/build
