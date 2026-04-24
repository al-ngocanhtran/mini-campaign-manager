FROM node:20-alpine

WORKDIR /app

# Enable yarn via corepack
RUN corepack enable

# Copy workspace manifests first for cache efficiency
COPY package.json yarn.lock .yarnrc.yml ./
COPY backend/package.json ./backend/
COPY frontend/package.json ./frontend/

# Install all workspace deps (hoisted to root node_modules)
RUN yarn install --immutable

# Copy the backend source
COPY backend ./backend
COPY .env.example ./.env.example

WORKDIR /app/backend

EXPOSE 3001

# Default to running migrations then starting the server
CMD sh -c "yarn run migrate && yarn run start"
