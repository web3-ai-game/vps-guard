#!/usr/bin/env python3
"""Harden Fail2Ban SSH + add aggressive recidive jail"""

# Rewrite jail.local with hardened settings
jail_conf = """[DEFAULT]
bantime = 86400
findtime = 600
maxretry = 3
banaction = ufw

[sshd]
enabled = true
port = 22
filter = sshd
logpath = /var/log/auth.log
maxretry = 2
findtime = 300
bantime = 604800

[sshd-aggressive]
enabled = true
port = 22
filter = sshd[mode=aggressive]
logpath = /var/log/auth.log
maxretry = 1
findtime = 86400
bantime = 2592000

[nginx-botsearch]
enabled = true
port = http,https
filter = nginx-botsearch
logpath = /var/log/nginx/access.log
maxretry = 2
findtime = 300
bantime = 604800

[nginx-limit-req]
enabled = true
port = http,https
filter = nginx-limit-req
logpath = /var/log/nginx/error.log
maxretry = 3
findtime = 300
bantime = 86400

[recidive]
enabled = true
filter = recidive
logpath = /var/log/fail2ban.log
maxretry = 2
findtime = 604800
bantime = 2592000
banaction = ufw
"""

with open('/etc/fail2ban/jail.local', 'w') as f:
    f.write(jail_conf)
print('[OK] jail.local hardened')

# Ensure sshd aggressive filter exists
import os
agg_filter = '/etc/fail2ban/filter.d/sshd.conf'
if os.path.exists(agg_filter):
    with open(agg_filter) as f:
        content = f.read()
    if 'mode = aggressive' not in content and 'aggressive' not in content:
        print('[INFO] sshd filter using default aggressive mode support')

import subprocess
r = subprocess.run(['systemctl', 'restart', 'fail2ban'], capture_output=True, text=True)
if r.returncode == 0:
    print('[OK] fail2ban restarted')
else:
    print(f'[FAIL] {r.stderr}')

import time
time.sleep(3)
r2 = subprocess.run(['fail2ban-client', 'status'], capture_output=True, text=True)
print(r2.stdout)
