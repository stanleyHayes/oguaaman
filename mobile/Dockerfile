# Oguaa mobile — browseable web preview of the Expo app (export → nginx).
# (Native iOS/Android run via `pnpm start` / EAS; this serves the web target.)
FROM node:20-alpine AS build
WORKDIR /app
RUN npm install -g pnpm@10
COPY package.json pnpm-lock.yaml ./
RUN pnpm install
COPY . .
ENV EXPO_PUBLIC_API_URL=""
RUN pnpm exec expo export --platform web

FROM nginx:1.27-alpine
COPY nginx.conf /etc/nginx/conf.d/default.conf
COPY --from=build /app/dist /usr/share/nginx/html
RUN chmod -R a+rX /usr/share/nginx/html
EXPOSE 80
