#!/usr/bin/env python3
"""Fix nginx config on VPS - run on the VPS directly"""

BOG_CONF = r"""server {
    listen 80 default_server;
    listen [::]:80 default_server;
    server_name 167.71.13.130 _;
    root /var/www/bog;
    index index.html;
    server_tokens off;
    client_max_body_size 10M;
    client_body_timeout 10s;
    client_header_timeout 10s;

    gzip on;
    gzip_types text/plain text/css application/json application/javascript text/xml application/xml application/xml+rss text/javascript;
    gzip_min_length 1024;

    # Block sensitive files
    location ~ /\.env { return 404; }
    location ~ /\.git { return 404; }
    location ~ /\.htaccess { return 404; }
    location ~ \.php$ { return 404; }
    location ~ \.sql$ { return 404; }
    location ~ /wp-(admin|login|content|includes) { return 404; }
    location ~ /phpmyadmin { return 404; }
    location = /robots.txt { allow all; access_log off; }
    location = /favicon.ico { access_log off; log_not_found off; }

    # Cache static assets
    location /assets/ {
        expires 1y;
        add_header Cache-Control "public, immutable";
        limit_req zone=general burst=20 nodelay;
    }

    # Blue Team Panel
    location /panel/ {
        proxy_pass http://127.0.0.1:3001/;
        proxy_http_version 1.1;
        proxy_set_header Upgrade $http_upgrade;
        proxy_set_header Connection "upgrade";
        proxy_set_header Host $host;
        proxy_set_header X-Real-IP $remote_addr;
        proxy_set_header X-Forwarded-For $proxy_add_x_forwarded_for;
        proxy_set_header X-Forwarded-Proto $scheme;
        proxy_read_timeout 86400;
        limit_req zone=api burst=15 nodelay;
    }
    location /panel/ws {
        proxy_pass http://127.0.0.1:3001/ws;
        proxy_http_version 1.1;
        proxy_set_header Upgrade $http_upgrade;
        proxy_set_header Connection "upgrade";
        proxy_set_header Host $host;
        proxy_set_header X-Real-IP $remote_addr;
    }
    location /panel/api/ {
        proxy_pass http://127.0.0.1:3001/api/;
        proxy_set_header Host $host;
        proxy_set_header X-Real-IP $remote_addr;
        proxy_set_header X-Forwarded-For $proxy_add_x_forwarded_for;
        limit_req zone=api burst=10 nodelay;
    }

    # SPA fallback
    location / {
        try_files $uri $uri/ /index.html;
        limit_req zone=general burst=30 nodelay;
    }

    # Security headers
    add_header X-Frame-Options "SAMEORIGIN" always;
    add_header X-Content-Type-Options "nosniff" always;
    add_header Referrer-Policy "strict-origin-when-cross-origin" always;
    add_header X-XSS-Protection "1; mode=block" always;
    add_header Permissions-Policy "camera=(), microphone=(), geolocation=()" always;
}
"""

import re

# Fix nginx.conf
with open('/etc/nginx/nginx.conf') as f:
    c = f.read()

# Remove all broken lines
c = re.sub(r'^\s*n\s*$', '', c, flags=re.MULTILINE)
c = re.sub(r'^\s*# Rate limiting\s*\n\s*limit_req_zone.*\n(?:\s*limit_req_zone.*\n)*', '', c)
c = re.sub(r'\n{3,}', '\n\n', c)

# Insert rate limiting after http {
rate_block = """    # Rate limiting
    limit_req_zone $binary_remote_addr zone=general:10m rate=10r/s;
    limit_req_zone $binary_remote_addr zone=api:10m rate=5r/s;
"""
c = c.replace('http {\n', 'http {\n' + rate_block, 1)

with open('/etc/nginx/nginx.conf', 'w') as f:
    f.write(c)
print('[OK] nginx.conf fixed')

# Write bog config
with open('/etc/nginx/sites-available/bog', 'w') as f:
    f.write(BOG_CONF)
print('[OK] bog config written')

# Verify
import subprocess
r = subprocess.run(['nginx', '-t'], capture_output=True, text=True)
print(r.stdout + r.stderr)
if r.returncode == 0:
    subprocess.run(['systemctl', 'reload', 'nginx'])
    print('[OK] Nginx reloaded')
else:
    print('[FAIL] Nginx test failed')
