FROM oven/bun

WORKDIR /app

RUN apt-get update && apt-get install -y git docker.io

COPY package.json bunfig.toml ./

COPY tsconfig.json ./
COPY src ./src

RUN bun install
RUN bun run build

WORKDIR /app

ENV NODE_ENV=production

CMD ["bun", "run", "start"]
