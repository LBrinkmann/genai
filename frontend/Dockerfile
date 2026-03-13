FROM node:22-slim AS dev

WORKDIR /app

COPY package.json package-lock.json* ./

RUN npm install

COPY . .

CMD ["npm", "start"]

# --- Build stage -----------------------------------------------------
FROM node:22-slim AS build

WORKDIR /app

ARG REACT_APP_API_URL
ENV REACT_APP_API_URL=$REACT_APP_API_URL

COPY package.json package-lock.json* ./

RUN npm install

COPY . .

RUN npm run build

# --- Production stage (static files only) ----------------------------
FROM scratch AS prod

COPY --from=build /app/build /app/build
