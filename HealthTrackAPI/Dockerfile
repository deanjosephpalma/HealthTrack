FROM php:8.2-apache

# Install dependencies needed for Laravel and PostgreSQL
RUN apt-get update && apt-get install -y \
    git curl libpng-dev libonig-dev libxml2-dev zip unzip libpq-dev

# Clear cache
RUN apt-get clean && rm -rf /var/lib/apt/lists/*

# Install PHP extensions
RUN docker-php-ext-install pdo_pgsql mbstring exif pcntl bcmath gd

# Enable Apache mod_rewrite
RUN a2enmod rewrite

# Set working directory
WORKDIR /var/www/html

# Copy project files
COPY . /var/www/html

# Install Composer explicitly ensuring it runs where artisan lives
COPY --from=composer:latest /usr/bin/composer /usr/bin/composer
RUN composer install --no-dev --no-interaction --prefer-dist --optimize-autoloader --no-progress

# Set permissions for Laravel storage and cache
RUN chown -R www-data:www-data /var/www/html/storage /var/www/html/bootstrap/cache

# Point Apache to the Laravel 'public' folder
ENV APACHE_DOCUMENT_ROOT /var/www/html/public
RUN sed -ri -e 's!/var/www/html!${APACHE_DOCUMENT_ROOT}!g' /etc/apache2/sites-available/*.conf
RUN sed -ri -e 's!/var/www/!${APACHE_DOCUMENT_ROOT}!g' /etc/apache2/apache2.conf /etc/apache2/conf-available/*.conf

EXPOSE 80