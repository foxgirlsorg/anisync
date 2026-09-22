FROM node:20-alpine AS app

# openssl is required by Prisma's query engine on Alpine.
RUN apk add --no-cache openssl

WORKDIR /app

COPY package.json package-lock.json ./
RUN npm ci

COPY . .

# Build against the sqlite schema variant; the entrypoint regenerates the
# client for whichever DB_PROVIDER is actually configured at container
# start. Pre-generating the mysql variant here too means its query-engine
# binary is already cached in node_modules, so the entrypoint's `prisma
# generate` never needs network access.
RUN DB_PROVIDER=sqlite npm run db:generate && npx next build
RUN DB_PROVIDER=mysql node scripts/select-db.js && npx prisma generate
RUN DB_PROVIDER=sqlite node scripts/select-db.js && npx prisma generate

RUN chmod +x docker-entrypoint.sh

ENV NODE_ENV=production
EXPOSE 3000

ENTRYPOINT ["./docker-entrypoint.sh"]
CMD ["web"]
