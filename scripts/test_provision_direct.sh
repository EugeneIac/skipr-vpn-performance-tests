#!/bin/bash
# Direct provision test using Postman credentials
# Testing agent 65.0.32.101 (from Postman, not from agents.json)

AGENT="https://65.0.32.101:443"
SIGNING_SERVICE="http://18.153.81.95:3000"
DEVICE_ID="c7a91f9aa35dae4eef1f73f8fb39fffe4f62a2e1"
PUBLIC_KEY="77e0e65fd0edba020b29dbc8bfda1ebde8aa5d6ead38339a86a2e49ea9157e0e"
PRIVATE_KEY="33dd5cfd940c06605feb76a616756961f6a6535a962d1f78b0a3745801273836"

echo "========================================"
echo "Direct Provision Test"
echo "========================================"
echo "Agent: $AGENT"
echo "Device ID: $DEVICE_ID"
echo ""

# Provision payload
PAYLOAD=$(cat <<EOF
{
  "ip_address": "83.5.133.110",
  "is_ip_address_static": false,
  "region": "switzerland",
  "service_type": "instant",
  "public_key": "$PUBLIC_KEY",
  "device_id": "$DEVICE_ID",
  "protocol": "openvpn"
}
EOF
)

echo "Step 1: Generating signature..."
SIGN_REQUEST=$(cat <<EOF
{
  "message": $PAYLOAD,
  "privateKey": "$PRIVATE_KEY",
  "publicKey": "$PUBLIC_KEY"
}
EOF
)

SIGNATURE=$(curl -s -X POST "$SIGNING_SERVICE/sign" \
  -H "Content-Type: application/json" \
  -d "$SIGN_REQUEST" | grep -o '"signature":"[^"]*"' | cut -d'"' -f4)

if [ -z "$SIGNATURE" ]; then
  echo "❌ Failed to generate signature"
  exit 1
fi

echo "✓ Signature generated"
echo ""

echo "Step 2: Sending provision request..."
echo "Payload: $PAYLOAD"
echo ""

RESPONSE=$(curl -sk -X POST "$AGENT/provision/do" \
  -H "Content-Type: application/json" \
  -H "X-Signature: $SIGNATURE" \
  -H "X-Public-Key: $PUBLIC_KEY" \
  -d "$PAYLOAD" \
  --max-time 30 \
  -w "\nHTTP_CODE:%{http_code}" 2>&1)

HTTP_CODE=$(echo "$RESPONSE" | grep "HTTP_CODE:" | cut -d: -f2)
BODY=$(echo "$RESPONSE" | grep -v "HTTP_CODE:")

echo "HTTP Status: $HTTP_CODE"
echo "Response: $BODY"
echo ""

if [ "$HTTP_CODE" == "200" ] || [ "$HTTP_CODE" == "201" ]; then
  echo "✅ Provision request accepted!"
else
  echo "❌ Provision request failed"
fi
