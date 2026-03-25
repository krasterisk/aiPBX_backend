#!/bin/bash
set -euo pipefail

# ============================================
# UFW Firewall Setup Script
# Usage: sudo ./setup-firewall.sh
# ============================================

# ── Trusted IPs (add your server IPs here) ──
TRUSTED_IPS=(
  "109.xx.xx.xx"    # aipbx.ru (новый VPS)
  # "45.76.229.242" # aipbx.net (старый Vultr)
  # "your.ip.here"  # Ваш домашний IP для SSH
)

# ── Public ports (open for everyone) ──
PUBLIC_PORTS=(
  "22/tcp"      # SSH
  "80/tcp"      # HTTP
  "443/tcp"     # HTTPS
  "3032/udp"    # RTP/Asterisk
)

# ── Restricted ports (only for trusted IPs) ──
RESTRICTED_PORTS=(
  "11434/tcp"   # Ollama
  "9090/tcp"    # Prometheus
  "3000/tcp"    # Grafana
)

echo "============================================"
echo "  UFW Firewall Setup"
echo "============================================"
echo "  Trusted IPs: ${TRUSTED_IPS[*]}"
echo "  Public ports: ${PUBLIC_PORTS[*]}"
echo "  Restricted ports: ${RESTRICTED_PORTS[*]}"
echo "============================================"
echo ""
read -p "This will RESET all UFW rules. Continue? (y/N): " CONFIRM
if [[ "${CONFIRM}" != "y" && "${CONFIRM}" != "Y" ]]; then
  echo "Aborted."
  exit 0
fi

# Reset
echo "[*] Resetting UFW..."
ufw --force reset

# Defaults
ufw default deny incoming
ufw default allow outgoing

# Public ports
echo "[*] Adding public ports..."
for PORT in "${PUBLIC_PORTS[@]}"; do
  ufw allow ${PORT} comment "Public"
  echo "    ✅ ${PORT}"
done

# Restricted ports — only for trusted IPs
echo "[*] Adding restricted ports for trusted IPs..."
for IP in "${TRUSTED_IPS[@]}"; do
  for PORT in "${RESTRICTED_PORTS[@]}"; do
    ufw allow from ${IP} to any port ${PORT%%/*} proto ${PORT##*/} comment "Trusted: ${IP}"
    echo "    ✅ ${IP} → ${PORT}"
  done
done

# Enable
echo "[*] Enabling UFW..."
ufw --force enable

echo ""
echo "============================================"
echo "  Done! Current rules:"
echo "============================================"
ufw status numbered
