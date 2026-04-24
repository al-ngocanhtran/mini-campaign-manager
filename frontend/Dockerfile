FROM node:20-alpine AS build

WORKDIR /app

RUN corepack enable

COPY package.json yarn.lock .yarnrc.yml ./
COPY backend/package.json ./backend/
COPY frontend/package.json ./frontend/

RUN yarn install --immutable

COPY frontend ./frontend

WORKDIR /app/frontend

# Vite dev mode for the demo — production deployments would run 'yarn build'
# and serve the dist/ behind nginx. Dev mode keeps hot reload for the exercise.
EXPOSE 5173

CMD ["yarn", "run", "dev", "--host", "0.0.0.0"]
