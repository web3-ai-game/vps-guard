#!/bin/bash
# Add nginx-related fail2ban jails

# Create nginx-botsearch filter if not exists
cat > /etc/fail2ban/filter.d/nginx-botsearch.conf << 'EOF'
[Definition]
failregex = ^<HOST> .* "(GET|POST|HEAD) .*(\.env|\.git|\.php|wp-admin|wp-login|phpmyadmin|xmlrpc|\.sql).*" (404|444) .*$
ignoreregex =
EOF

# Create nginx-limit-req filter if not exists  
cat > /etc/fail2ban/filter.d/nginx-limit-req.conf << 'EOF'
[Definition]
failregex = limiting requests, excess:.* by zone .*, client: <HOST>
ignoreregex =
EOF

# Add nginx jails
cat >> /etc/fail2ban/jail.local << 'EOF'

[nginx-botsearch]
enabled = true
port = http,https
filter = nginx-botsearch
logpath = /var/log/nginx/access.log
maxretry = 3
findtime = 300
bantime = 86400

[nginx-limit-req]
enabled = true
port = http,https
filter = nginx-limit-req
logpath = /var/log/nginx/error.log
maxretry = 5
findtime = 300
bantime = 3600
EOF

systemctl restart fail2ban
sleep 2
fail2ban-client status
echo "---"
fail2ban-client status nginx-botsearch 2>&1
echo "---"
fail2ban-client status nginx-limit-req 2>&1
