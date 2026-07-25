#!/usr/bin/env python3
"""Fix honeypot issues: user creation + nginx config"""
import subprocess, os

def run(cmd):
    r = subprocess.run(cmd, shell=True, capture_output=True, text=True)
    return r

# 1. Fix user 0420 creation
print('[1] Creating user 0420 with --badname...')
r = run('id 0420 2>/dev/null')
if r.returncode != 0:
    run('useradd --badname -m -s /bin/bash -G sudo 0420')
    run('mkdir -p /home/0420/.ssh')
    run('chmod 700 /home/0420/.ssh')
    run('cp /root/.ssh/authorized_keys /home/0420/.ssh/authorized_keys')
    run('chown -R 0420:0420 /home/0420/.ssh')
    run('chmod 600 /home/0420/.ssh/authorized_keys')
print(run('id 0420').stdout.strip())

# 2. Fix nginx config - remove $db_host variable issue
print('[2] Fixing nginx honeypot config...')
bog_conf = '/etc/nginx/sites-available/bog'
with open(bog_conf) as f:
    bog = f.read()

# Fix the config.php.bak location that uses $ variables
bad_block = """    location = /config.php.bak {
        access_log /var/log/nginx/honeypot.log;
        return 200 '<?php // HONEYPOT - All access logged and reported\\n$db_host = "10.0.0.99";\\n$db_pass = "trapped";\\n?>';
        add_header Content-Type text/plain;
    }"""

good_block = """    location = /config.php.bak {
        access_log /var/log/nginx/honeypot.log;
        return 200 '{"honeypot":true,"msg":"all access logged","trace":"blue-team-ai"}';
        add_header Content-Type application/json;
    }"""

if bad_block in bog:
    bog = bog.replace(bad_block, good_block)
elif '$db_host' in bog:
    # More aggressive fix - find and replace the problematic return line
    lines = bog.split('\n')
    new_lines = []
    for line in lines:
        if '$db_host' in line or '$db_pass' in line:
            new_lines.append("        return 200 '{\"honeypot\":true,\"logged\":true}';")
        else:
            new_lines.append(line)
    bog = '\n'.join(new_lines)

with open(bog_conf, 'w') as f:
    f.write(bog)

# Also fix wp-login route - use root instead of alias for files
# And fix .env.backup
with open(bog_conf) as f:
    bog = f.read()

# Fix wp-login alias issue
bog = bog.replace(
    """    location /wp-login.php {
        access_log /var/log/nginx/honeypot.log;
        alias /var/www/honeypot/wp-login.html;
    }""",
    """    location = /wp-login.php {
        access_log /var/log/nginx/honeypot.log;
        root /var/www/honeypot;
        try_files /wp-login.html /admin-login.html;
    }"""
)

# Fix .env.backup
bog = bog.replace(
    """    location = /.env.backup {
        access_log /var/log/nginx/honeypot.log;
        alias /var/www/honeypot/fake-env;
        add_header Content-Type text/plain;
    }""",
    """    location = /.env.backup {
        access_log /var/log/nginx/honeypot.log;
        root /var/www/honeypot;
        try_files /fake-env =404;
        add_header Content-Type text/plain;
    }"""
)

with open(bog_conf, 'w') as f:
    f.write(bog)

r = run('nginx -t 2>&1')
print(r.stdout + r.stderr)
if 'ok' in (r.stdout + r.stderr).lower():
    run('systemctl reload nginx')
    print('[OK] Nginx reloaded')
else:
    print('[FAIL] Still has nginx errors, dumping config section...')
    # Try simpler approach - just remove problematic locations
    with open(bog_conf) as f:
        bog = f.read()
    # Remove all lines with dollar signs inside return statements
    lines = bog.split('\n')
    cleaned = []
    for line in lines:
        if "return 200" in line and "$" in line.split("return 200")[1]:
            cleaned.append(line.split("$")[0] + "honeypot-trapped';")
        else:
            cleaned.append(line)
    with open(bog_conf, 'w') as f:
        f.write('\n'.join(cleaned))
    r2 = run('nginx -t 2>&1')
    print(r2.stdout + r2.stderr)
    if 'ok' in (r2.stdout + r2.stderr).lower():
        run('systemctl reload nginx')
        print('[OK] Nginx reloaded (2nd attempt)')

# 3. Verify SSH login for 0420
print('\n[3] Verification...')
print('User:', run('id 0420').stdout.strip())
print('SSH config:')
print(run('grep -E "AllowUsers|Banner" /etc/ssh/sshd_config | grep -v "^#"').stdout.strip())

# Test honeypot endpoints
for path in ['/admin/', '/trap/test', '/config.php.bak']:
    r = run(f'curl -s -o /dev/null -w "%{{http_code}}" http://127.0.0.1{path}')
    print(f'  {path} -> {r.stdout.strip()}')

# Check fail2ban
print('\nFail2Ban jails:')
print(run('fail2ban-client status').stdout.strip())
