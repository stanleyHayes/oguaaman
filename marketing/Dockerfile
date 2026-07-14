# Oguaa marketing site — build the Vite static site, serve with nginx.
# Distinct from the client portal (frontend/) — this is the public brochure that
# points people to the app. It proxies /api → api only for the live stats strip.
FROM node:20-alpine AS build
WORKDIR /app
# CTAs point at the portal/app — baked in at build time (Vite inlines VITE_*).
ARG VITE_PORTAL_URL=http://localhost:3000
ARG VITE_IOS_URL=#
ARG VITE_ANDROID_URL=#
ENV VITE_PORTAL_URL=$VITE_PORTAL_URL VITE_IOS_URL=$VITE_IOS_URL VITE_ANDROID_URL=$VITE_ANDROID_URL
RUN npm install -g pnpm@10
COPY package.json pnpm-lock.yaml ./
RUN pnpm install
COPY . .
RUN pnpm build

FROM nginx:1.27-alpine
COPY nginx.conf /etc/nginx/conf.d/default.conf
COPY --from=build /app/dist /usr/share/nginx/html
EXPOSE 80
