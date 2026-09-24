#!/bin/bash
set -e

echo "Updating system..."
sudo apt-get update
sudo DEBIAN_FRONTEND=noninteractive apt-get install -y docker.io docker-compose-v2 nginx certbot python3-certbot-nginx git

echo "Cloning repository..."
if [ -d "/opt/insurance_claim_agent" ]; then
    cd /opt/insurance_claim_agent
    sudo git fetch origin
    sudo git reset --hard origin/main
else
    sudo git clone https://github.com/neoromantics/insurance_claim_agent.git /opt/insurance_claim_agent
    cd /opt/insurance_claim_agent
fi

echo "Creating .env..."
sudo bash -c 'cat << \ENV_EOF > .env
OLLAMA_API_KEY=f03e1e9f8547450f87e1caf0bce2556b.voAXcllz8_lpO-ECliFPa37K
OLLAMA_BASE_URL=https://ollama.com/v1
OLLAMA_MODEL=nemotron-3-ultra
NUXT_APP_BASE_URL=/agent/
ENV_EOF'

echo "Starting Docker..."
sudo docker compose down || true
sudo docker compose up -d --build

echo "Configuring Nginx..."
sudo bash -c 'cat << \NGINX_EOF > /etc/nginx/sites-available/insurance_agent
server {
    listen 80;
    server_name vcm-51182.vm.duke.edu;

    location /agent/ {
        proxy_pass http://127.0.0.1:3000/agent/;
        proxy_http_version 1.1;
        proxy_set_header Upgrade $http_upgrade;
        proxy_set_header Connection "upgrade";
        proxy_set_header Host $host;
        proxy_set_header X-Real-IP $remote_addr;
        proxy_set_header X-Forwarded-For $proxy_add_x_forwarded_for;
        proxy_set_header X-Forwarded-Proto $scheme;
        proxy_buffering off;
        proxy_cache off;
    }
}
NGINX_EOF'

sudo ln -sf /etc/nginx/sites-available/insurance_agent /etc/nginx/sites-enabled/
sudo rm -f /etc/nginx/sites-enabled/default

echo "Testing Nginx..."
sudo nginx -t
sudo systemctl reload nginx

echo "Running Certbot..."
sudo certbot --nginx -n --agree-tos --email newromantics2001@gmail.com -d vcm-51182.vm.duke.edu --redirect

echo "Deployment complete."
