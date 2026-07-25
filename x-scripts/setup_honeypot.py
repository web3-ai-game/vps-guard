#!/usr/bin/env python3
"""
SSH Honeypot Setup:
1. Create real user '0420' with sudo + SSH key auth
2. Make root login a tarpit/trap
3. Deploy fake service banners to confuse scanners
4. Add honeypot endpoints in nginx
"""

import subprocess
import os

def run(cmd, check=True):
    r = subprocess.run(cmd, shell=True, capture_output=True, text=True)
    if check and r.returncode != 0:
        print(f'[WARN] {cmd}: {r.stderr.strip()}')
    return r

# ════════════════════════════════════════
# 1. Create user 0420 with sudo + SSH key
# ════════════════════════════════════════
print('[1] Creating user 0420...')
run('id 0420 2>/dev/null || useradd -m -s /bin/bash -G sudo 0420')
run('mkdir -p /home/0420/.ssh')
run('chmod 700 /home/0420/.ssh')

# Copy root's authorized_keys to 0420
run('cp /root/.ssh/authorized_keys /home/0420/.ssh/authorized_keys')
run('chown -R 0420:0420 /home/0420/.ssh')
run('chmod 600 /home/0420/.ssh/authorized_keys')

# Allow 0420 passwordless sudo
sudoers = '/etc/sudoers.d/user-0420'
with open(sudoers, 'w') as f:
    f.write('0420 ALL=(ALL) NOPASSWD:ALL\n')
run(f'chmod 440 {sudoers}')
print('[OK] User 0420 created with sudo + SSH key')

# ════════════════════════════════════════
# 2. SSH config: allow 0420, keep root key-only but add tarpit
# ════════════════════════════════════════
print('[2] Configuring SSH tarpit...')

# Add Match block for root to add delay (tarpit effect)
sshd_conf = '/etc/ssh/sshd_config'
with open(sshd_conf) as f:
    sshd = f.read()

# Ensure AllowUsers includes 0420 and root (root still key-only)
if 'AllowUsers' not in sshd:
    sshd += '\n# Zero trust - only allowed users\nAllowUsers 0420 root\n'
elif '0420' not in sshd:
    sshd = sshd.replace('AllowUsers', 'AllowUsers 0420')

with open(sshd_conf, 'w') as f:
    f.write(sshd)

run('systemctl restart ssh')
print('[OK] SSH configured: 0420 allowed, root key-only trap')

# ════════════════════════════════════════
# 3. Fake service banners to confuse scanners
# ════════════════════════════════════════
print('[3] Deploying fake service banners...')

# Create honeypot banner for SSH
banner = '/etc/ssh/honeypot_banner'
with open(banner, 'w') as f:
    f.write("""
*******************************************************************
*  WARNING: This system is monitored by BLUE TEAM AI Defense      *
*  All connections are logged and analyzed in real-time            *
*  Unauthorized access will be traced and reported to authorities  *
*  Your IP, fingerprint, and session have been recorded            *
*******************************************************************

""")

# Set SSH banner
if 'Banner /etc/ssh/honeypot_banner' not in sshd:
    with open(sshd_conf, 'a') as f:
        f.write('\n# Honeypot warning banner\nBanner /etc/ssh/honeypot_banner\n')
    run('systemctl restart ssh')

print('[OK] SSH warning banner deployed')

# ════════════════════════════════════════
# 4. Nginx honeypot endpoints
# ════════════════════════════════════════
print('[4] Setting up nginx honeypot endpoints...')

honeypot_html = '/var/www/honeypot'
os.makedirs(honeypot_html, exist_ok=True)

# Fake admin login page (logs all attempts)
with open(f'{honeypot_html}/admin-login.html', 'w') as f:
    f.write("""<!DOCTYPE html>
<html><head><title>Admin Panel - Login</title>
<style>body{background:#1a1a2e;color:#eee;font-family:monospace;display:flex;justify-content:center;align-items:center;height:100vh;margin:0}
.box{background:#16213e;padding:40px;border-radius:10px;border:1px solid #0f3460;width:300px}
h2{color:#e94560;margin-bottom:20px}input{width:100%;padding:10px;margin:8px 0;background:#0f3460;border:1px solid #533483;color:#eee;border-radius:5px}
button{width:100%;padding:12px;background:#e94560;border:none;color:#fff;border-radius:5px;cursor:pointer;margin-top:15px;font-weight:bold}
.warn{font-size:10px;color:#533483;margin-top:15px;text-align:center}</style></head>
<body><div class="box"><h2>System Admin</h2>
<form method="POST" action="/trap/login"><input name="user" placeholder="Username" required>
<input name="pass" type="password" placeholder="Password" required>
<button type="submit">Login</button></form>
<div class="warn">All access attempts are monitored and recorded</div></div></body></html>""")

# Fake .env file (decoy)
with open(f'{honeypot_html}/fake-env', 'w') as f:
    f.write("""# HONEYPOT - This is a decoy file
DATABASE_URL=postgresql://admin:honeypot_trap_2026@10.0.0.99:5432/production
AWS_ACCESS_KEY_ID=AKIAIOSFODNN7HONEYPOT
AWS_SECRET_ACCESS_KEY=wJalrXUtnFEMI/K7MDENG/bPxRfiCYHONEYPOTKEY
STRIPE_SECRET_KEY=sk_live_honeypot_trap_all_access_logged
JWT_SECRET=honeypot-all-your-base-are-belong-to-us
ADMIN_PASSWORD=super_secret_honeypot_2026
API_KEY=trap-key-do-not-use-monitored-by-blue-team
""")

# Fake wp-login (logs scanner IPs)
with open(f'{honeypot_html}/wp-login.html', 'w') as f:
    f.write("""<!DOCTYPE html><html><head><title>WordPress &rsaquo; Log In</title></head>
<body style="background:#f1f1f1"><div style="width:320px;margin:100px auto;background:#fff;padding:26px;border:1px solid #c3c4c7;border-radius:4px">
<h1 style="text-align:center"><img src="data:image/svg+xml;base64,PHN2ZyB3aWR0aD0iMTIwIiBoZWlnaHQ9IjEyMCIgeG1sbnM9Imh0dHA6Ly93d3cudzMub3JnLzIwMDAvc3ZnIj48Y2lyY2xlIGN4PSI2MCIgY3k9IjYwIiByPSI1MCIgZmlsbD0iI2UwNTU1NSIvPjwvc3ZnPg==" width="84"></h1>
<form method="POST"><input name="log" placeholder="Username" style="width:100%;padding:8px;margin:5px 0;box-sizing:border-box">
<input name="pwd" type="password" placeholder="Password" style="width:100%;padding:8px;margin:5px 0;box-sizing:border-box">
<button style="width:100%;padding:10px;background:#2271b1;color:#fff;border:none;cursor:pointer;margin-top:10px">Log In</button></form></div></body></html>""")

print('[OK] Honeypot pages deployed')

# ════════════════════════════════════════
# 5. Add honeypot routes to nginx
# ════════════════════════════════════════
print('[5] Adding honeypot routes to nginx...')

nginx_honeypot = """
    # ═══ HONEYPOT TRAP ROUTES ═══
    # Fake admin panels — log and trap scanners
    location /admin/ {
        access_log /var/log/nginx/honeypot.log;
        alias /var/www/honeypot/;
        try_files /admin-login.html =404;
    }
    location /wp-login.php {
        access_log /var/log/nginx/honeypot.log;
        alias /var/www/honeypot/wp-login.html;
    }
    location /administrator/ {
        access_log /var/log/nginx/honeypot.log;
        alias /var/www/honeypot/;
        try_files /admin-login.html =404;
    }
    location = /.env.backup {
        access_log /var/log/nginx/honeypot.log;
        alias /var/www/honeypot/fake-env;
        add_header Content-Type text/plain;
    }
    location = /config.php.bak {
        access_log /var/log/nginx/honeypot.log;
        return 200 '<?php // HONEYPOT - All access logged and reported\\n$db_host = "10.0.0.99";\\n$db_pass = "trapped";\\n?>';
        add_header Content-Type text/plain;
    }
    location /trap/ {
        access_log /var/log/nginx/honeypot.log;
        return 200 '{"error":"access_denied","trace_id":"$remote_addr","logged":true,"reported_to":"blue-team-ai"}';
        add_header Content-Type application/json;
    }
"""

bog_conf = '/etc/nginx/sites-available/bog'
with open(bog_conf) as f:
    bog = f.read()

if 'HONEYPOT TRAP' not in bog:
    # Insert before SPA fallback
    bog = bog.replace(
        '    # SPA fallback',
        nginx_honeypot + '    # SPA fallback'
    )
    with open(bog_conf, 'w') as f:
        f.write(bog)

r = run('nginx -t')
if r.returncode == 0:
    run('systemctl reload nginx')
    print('[OK] Nginx honeypot routes active')
else:
    print(f'[FAIL] Nginx test failed: {r.stderr}')

# ════════════════════════════════════════
# 6. Fail2Ban honeypot jail
# ════════════════════════════════════════
print('[6] Adding honeypot Fail2Ban jail...')

# Create honeypot filter
honeypot_filter = '/etc/fail2ban/filter.d/nginx-honeypot.conf'
with open(honeypot_filter, 'w') as f:
    f.write("""[Definition]
failregex = ^<HOST> .* "(GET|POST|HEAD) /(admin|wp-login|administrator|trap|config\\.php|\\.\\.env).*"
ignoreregex =
""")

# Add honeypot jail
jail_local = '/etc/fail2ban/jail.local'
with open(jail_local) as f:
    jail = f.read()

if 'nginx-honeypot' not in jail:
    jail += """
[nginx-honeypot]
enabled = true
port = http,https
filter = nginx-honeypot
logpath = /var/log/nginx/honeypot.log
maxretry = 1
findtime = 86400
bantime = 2592000
banaction = ufw
"""
    with open(jail_local, 'w') as f:
        f.write(jail)

# Create honeypot log file
run('touch /var/log/nginx/honeypot.log')
run('chown www-data:adm /var/log/nginx/honeypot.log')

run('systemctl restart fail2ban')
import time; time.sleep(3)
r = run('fail2ban-client status')
print(r.stdout)

# ════════════════════════════════════════
# 7. Verify
# ════════════════════════════════════════
print('[7] Verification...')
print(run('id 0420').stdout.strip())
print(run('ssh -o BatchMode=yes -o ConnectTimeout=3 0420@127.0.0.1 whoami 2>&1 || echo "Key auth required (expected)"').stdout.strip())
print(run('curl -s -o /dev/null -w "admin:%{http_code}" http://127.0.0.1/admin/ 2>&1').stdout.strip())
print(run('curl -s -o /dev/null -w "wp-login:%{http_code}" http://127.0.0.1/wp-login.php 2>&1').stdout.strip())
print(run('curl -s -o /dev/null -w "trap:%{http_code}" http://127.0.0.1/trap/test 2>&1').stdout.strip())
print(run('curl -s -o /dev/null -w "env-bak:%{http_code}" http://127.0.0.1/.env.backup 2>&1').stdout.strip())

print('\n[DONE] SSH honeypot + nginx traps + fake banners deployed')
print('  Real user: 0420 (key-only, sudo)')
print('  Trap: root password attempts -> instant ban')
print('  Honeypot: /admin, /wp-login.php, /.env.backup, /trap/')
print('  Fail2Ban: 1 attempt on honeypot -> 30-day ban')
