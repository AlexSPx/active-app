# --- Stage 1: Build ---
FROM node:20-alpine AS builder

WORKDIR /app

# Build-time args
ARG EXPO_PUBLIC_API_BASE_URL
ARG EXPO_PUBLIC_GOOGLE_CLIENT_ID
ARG EXPO_PUBLIC_POSTHOG_API_KEY
ARG EXPO_PUBLIC_WORKOS_CLIENT_ID

# Make them available to Expo
ENV EXPO_PUBLIC_API_BASE_URL=$EXPO_PUBLIC_API_BASE_URL
ENV EXPO_PUBLIC_GOOGLE_CLIENT_ID=$EXPO_PUBLIC_GOOGLE_CLIENT_ID
ENV EXPO_PUBLIC_POSTHOG_API_KEY=$EXPO_PUBLIC_POSTHOG_API_KEY
ENV EXPO_PUBLIC_WORKOS_CLIENT_ID=$EXPO_PUBLIC_WORKOS_CLIENT_ID

COPY package*.json ./
RUN npm install

COPY . .

# Optional sanity check (remove after debugging)
# RUN printenv | grep EXPO_PUBLIC

RUN npx expo export -p web --clear

# --- Stage 2: Serve ---
FROM nginx:alpine

COPY nginx.conf /etc/nginx/conf.d/default.conf
COPY --from=builder /app/dist /usr/share/nginx/html

EXPOSE 80
CMD ["nginx", "-g", "daemon off;"]