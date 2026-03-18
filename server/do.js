const axios = require('axios')

const DO_BASE = 'https://api.digitalocean.com/v2'

function client() {
  const token = process.env.DO_API_TOKEN
  if (!token) throw new Error('DO_API_TOKEN not configured')
  return axios.create({
    baseURL: DO_BASE,
    headers: { Authorization: `Bearer ${token}`, 'Content-Type': 'application/json' },
    timeout: 20000,
  })
}

async function listDroplets() {
  const r = await client().get('/droplets?tag_name=blue-team-shield&per_page=50')
  return r.data.droplets.map(d => ({
    id: d.id,
    name: d.name,
    status: d.status,
    region: d.region?.slug,
    regionName: d.region?.name,
    size: d.size_slug,
    ip: d.networks?.v4?.find(n => n.type === 'public')?.ip_address || null,
    memory: d.memory,
    vcpus: d.vcpus,
    createdAt: d.created_at,
    tags: d.tags,
  }))
}

async function listRegions() {
  const r = await client().get('/regions')
  return r.data.regions
    .filter(rg => rg.available)
    .map(rg => ({ slug: rg.slug, name: rg.name, available: rg.available }))
}

async function listSizes() {
  const r = await client().get('/sizes')
  const cheap = r.data.sizes
    .filter(s => s.available && s.price_monthly <= 12)
    .sort((a, b) => a.price_monthly - b.price_monthly)
    .slice(0, 8)
  return cheap.map(s => ({
    slug: s.slug,
    memory: s.memory,
    vcpus: s.vcpus,
    disk: s.disk,
    price_monthly: s.price_monthly,
  }))
}

function buildCloudInit(targetIp, targetPort) {
  const proxy = targetIp
    ? `
    location / {
        proxy_pass http://${targetIp}:${targetPort || 80};
        proxy_set_header Host $host;
        proxy_set_header X-Real-IP $remote_addr;
        proxy_set_header X-Forwarded-For $proxy_add_x_forwarded_for;
        limit_req zone=cc burst=20 nodelay;
    }`
    : `
    location / {
        return 200 '{"status":"shield_active"}';
        add_header Content-Type application/json;
    }`

  return `#!/bin/bash
export DEBIAN_FRONTEND=noninteractive
apt-get update -qq
apt-get install -y -qq nginx fail2ban ufw

# UFW Firewall
ufw default deny incoming
ufw default allow outgoing
ufw allow 22/tcp
ufw allow 80/tcp
ufw allow 443/tcp
ufw --force enable

# Nginx with rate limiting
cat > /etc/nginx/nginx.conf << 'EOF'
user www-data;
worker_processes auto;
pid /run/nginx.pid;

events { worker_connections 1024; }

http {
    limit_req_zone $binary_remote_addr zone=cc:10m rate=30r/m;
    limit_conn_zone $binary_remote_addr zone=addr:10m;

    server {
        listen 80;
        server_name _;

        limit_conn addr 10;
        limit_req zone=cc burst=20 nodelay;

        location /health {
            return 200 '{"shield":"active","ts":"${ISO}"}';
            add_header Content-Type application/json;
        }
${proxy}
    }
}
EOF

nginx -t && systemctl restart nginx

# Fail2ban for CC/brute force
cat > /etc/fail2ban/jail.local << 'EOF2'
[DEFAULT]
bantime = 3600
findtime = 300
maxretry = 50

[nginx-req-limit]
enabled = true
filter = nginx-req-limit
logpath = /var/log/nginx/error.log
EOF2

systemctl restart fail2ban

echo "SHIELD_READY" > /root/shield_status
`.replace('${ISO}', new Date().toISOString())
}

async function createShieldDroplet({ name, region, size, targetIp, targetPort, sshKeyIds }) {
  const userData = buildCloudInit(targetIp, targetPort)
  const body = {
    name: name || `bt-shield-${Date.now()}`,
    region: region || 'sgp1',
    size: size || 's-1vcpu-512mb-10gb',
    image: 'ubuntu-24-04-x64',
    user_data: userData,
    tags: ['blue-team-shield'],
    ipv6: false,
    monitoring: true,
  }
  if (sshKeyIds && sshKeyIds.length > 0) body.ssh_keys = sshKeyIds

  const r = await client().post('/droplets', body)
  const d = r.data.droplet
  return {
    id: d.id,
    name: d.name,
    status: d.status,
    region: d.region?.slug,
    size: d.size_slug,
    createdAt: d.created_at,
  }
}

async function destroyDroplet(id) {
  await client().delete(`/droplets/${id}`)
  return { ok: true }
}

async function getDroplet(id) {
  const r = await client().get(`/droplets/${id}`)
  const d = r.data.droplet
  return {
    id: d.id,
    name: d.name,
    status: d.status,
    region: d.region?.slug,
    regionName: d.region?.name,
    size: d.size_slug,
    ip: d.networks?.v4?.find(n => n.type === 'public')?.ip_address || null,
    memory: d.memory,
    vcpus: d.vcpus,
    createdAt: d.created_at,
  }
}

async function listSSHKeys() {
  const r = await client().get('/account/ssh_keys')
  return r.data.ssh_keys.map(k => ({ id: k.id, name: k.name, fingerprint: k.fingerprint }))
}

async function getAccount() {
  const r = await client().get('/account')
  return {
    email: r.data.account?.email,
    status: r.data.account?.status,
    dropletLimit: r.data.account?.droplet_limit,
    floatingIpLimit: r.data.account?.floating_ip_limit,
  }
}

module.exports = { listDroplets, listRegions, listSizes, createShieldDroplet, destroyDroplet, getDroplet, listSSHKeys, getAccount }
