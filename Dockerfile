# --- Stage 1: Build ---
FROM node:24-alpine AS builder

WORKDIR /app

# Build-time args
ARG EXPO_PUBLIC_API_BASE_URL
ARG EXPO_PUBLIC_GOOGLE_CLIENT_ID
ARG EXPO_PUBLIC_WORKOS_CLIENT_ID

# Make them available to Expo
ENV EXPO_PUBLIC_API_BASE_URL=$EXPO_PUBLIC_API_BASE_URL
ENV EXPO_PUBLIC_GOOGLE_CLIENT_ID=$EXPO_PUBLIC_GOOGLE_CLIENT_ID
ENV EXPO_PUBLIC_WORKOS_CLIENT_ID=$EXPO_PUBLIC_WORKOS_CLIENT_ID

COPY package.json yarn.lock ./
COPY apps/client/package.json apps/client/package.json
COPY tools/promo/package.json tools/promo/package.json
RUN corepack enable && yarn install --frozen-lockfile

COPY . .

# Optional sanity check (remove after debugging)
# RUN printenv | grep EXPO_PUBLIC

RUN yarn workspace active-next expo export -p web --clear

# --- Stage 2: Serve ---
FROM nginx:alpine

COPY nginx.conf /etc/nginx/conf.d/default.conf
COPY --from=builder /app/apps/client/dist /usr/share/nginx/html

EXPOSE 80
CMD ["nginx", "-g", "daemon off;"]