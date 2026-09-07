#!/usr/bin/env bash

set -e

echo "=================================================="
echo "Starting HealthTrack Laravel API"
echo "=================================================="

cd /var/www/html

# ----------------------------------------------------
# Make sure required Laravel directories exist
# ----------------------------------------------------
mkdir -p storage/framework/cache
mkdir -p storage/framework/sessions
mkdir -p storage/framework/views
mkdir -p storage/logs
mkdir -p bootstrap/cache

# ----------------------------------------------------
# Fix permissions
# ----------------------------------------------------
chown -R www-data:www-data storage bootstrap/cache

chmod -R 775 storage bootstrap/cache

# ----------------------------------------------------
# Clear old Laravel caches
# ----------------------------------------------------
echo "Clearing Laravel caches..."

php artisan optimize:clear

# ----------------------------------------------------
# Create storage symbolic link
# ----------------------------------------------------
echo "Creating storage link..."

php artisan storage:link || true

# ----------------------------------------------------
# Cache configuration/routes/views
# ----------------------------------------------------
echo "Caching Laravel configuration..."

php artisan config:cache
php artisan route:cache
php artisan view:cache

# ----------------------------------------------------
# Database migrations
#
# IMPORTANT:
# Set RUN_MIGRATIONS=true in Render ONLY when you
# intentionally want migrations to run.
# ----------------------------------------------------
if [ "${RUN_MIGRATIONS:-false}" = "true" ]; then
    echo "Running database migrations..."

    php artisan migrate --force

    echo "Database migrations completed."
else
    echo "RUN_MIGRATIONS is not true."
    echo "Skipping database migrations."
fi

# ----------------------------------------------------
# Start PHP-FPM
# ----------------------------------------------------
echo "Starting PHP-FPM..."

php-fpm -D

# ----------------------------------------------------
# Verify PHP-FPM started
# ----------------------------------------------------
sleep 2

if ! pgrep -x php-fpm >/dev/null; then
    echo "ERROR: PHP-FPM failed to start."
    exit 1
fi

echo "PHP-FPM started successfully."

# ----------------------------------------------------
# Start NGINX
# ----------------------------------------------------
echo "Starting NGINX..."

exec nginx -g "daemon off;"