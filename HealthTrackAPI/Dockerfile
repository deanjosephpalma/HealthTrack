# ============================================================
# HealthTrack API - Laravel 12
# PHP 8.3 + NGINX + PHP-FPM + Node/Vite
# ============================================================

FROM php:8.3-fpm-bookworm

# ------------------------------------------------------------
# Environment
# ------------------------------------------------------------
ENV DEBIAN_FRONTEND=noninteractive
ENV COMPOSER_ALLOW_SUPERUSER=1

WORKDIR /var/www/html

# ------------------------------------------------------------
# Install system dependencies
# ------------------------------------------------------------
RUN apt-get update && apt-get install -y \
    nginx \
    curl \
    git \
    unzip \
    zip \
    libpq-dev \
    libzip-dev \
    libicu-dev \
    libonig-dev \
    libxml2-dev \
    libpng-dev \
    libjpeg62-turbo-dev \
    libfreetype6-dev \
    libwebp-dev \
    ca-certificates \
    gnupg \
    bash \
    && rm -rf /var/lib/apt/lists/*

# ------------------------------------------------------------
# PHP extensions required by Laravel
# ------------------------------------------------------------
RUN docker-php-ext-configure gd \
        --with-freetype \
        --with-jpeg \
        --with-webp \
    && docker-php-ext-install -j$(nproc) \
        pdo_pgsql \
        mbstring \
        bcmath \
        exif \
        pcntl \
        intl \
        zip \
        gd \
        opcache

# ------------------------------------------------------------
# Install Composer
# ------------------------------------------------------------
COPY --from=composer:2 /usr/bin/composer /usr/bin/composer

# ------------------------------------------------------------
# Install Node.js 22
# Vite 7/8 works well with modern Node versions.
# ------------------------------------------------------------
RUN curl -fsSL https://deb.nodesource.com/setup_22.x | bash - \
    && apt-get install -y nodejs \
    && node --version \
    && npm --version

# ------------------------------------------------------------
# Copy Composer files first for Docker layer caching
# ------------------------------------------------------------
COPY composer.json composer.lock ./

# Install production PHP dependencies
RUN composer install \
    --no-dev \
    --no-interaction \
    --prefer-dist \
    --optimize-autoloader \
    --no-progress

# ------------------------------------------------------------
# Copy package files
# ------------------------------------------------------------
COPY package.json package-lock.json* ./

# Install Node dependencies
RUN npm ci

# ------------------------------------------------------------
# Copy Laravel application
# ------------------------------------------------------------
COPY . .

# ------------------------------------------------------------
# Build Laravel/Vite assets
# ------------------------------------------------------------
RUN npm run build

# Remove Node dependencies after building
RUN rm -rf node_modules

# ------------------------------------------------------------
# Laravel directory permissions
# ------------------------------------------------------------
RUN mkdir -p \
        storage/framework/cache \
        storage/framework/sessions \
        storage/framework/views \
        storage/logs \
        bootstrap/cache \
    && chown -R www-data:www-data \
        storage \
        bootstrap/cache \
    && chmod -R 775 \
        storage \
        bootstrap/cache

# ------------------------------------------------------------
# NGINX configuration
# ------------------------------------------------------------
RUN rm -f /etc/nginx/sites-enabled/default \
          /etc/nginx/sites-available/default

COPY nginx.conf /etc/nginx/conf.d/default.conf

# ------------------------------------------------------------
# PHP production configuration
# ------------------------------------------------------------
RUN { \
        echo "opcache.enable=1"; \
        echo "opcache.enable_cli=1"; \
        echo "opcache.memory_consumption=128"; \
        echo "opcache.interned_strings_buffer=16"; \
        echo "opcache.max_accelerated_files=20000"; \
        echo "opcache.validate_timestamps=0"; \
        echo "opcache.save_comments=1"; \
    } > /usr/local/etc/php/conf.d/opcache.ini

# ------------------------------------------------------------
# PHP-FPM configuration
# ------------------------------------------------------------
RUN sed -i 's/^;clear_env = no/clear_env = no/' \
    /usr/local/etc/php-fpm.d/www.conf \
    && sed -i 's/^user = .*/user = www-data/' \
    /usr/local/etc/php-fpm.d/www.conf \
    && sed -i 's/^group = .*/group = www-data/' \
    /usr/local/etc/php-fpm.d/www.conf

# ------------------------------------------------------------
# Startup script
# ------------------------------------------------------------
COPY start.sh /usr/local/bin/start.sh

RUN chmod +x /usr/local/bin/start.sh

# ------------------------------------------------------------
# Render uses port 10000 for web services
# ------------------------------------------------------------
EXPOSE 10000

# ------------------------------------------------------------
# Start Laravel
# ------------------------------------------------------------
CMD ["/usr/local/bin/start.sh"]