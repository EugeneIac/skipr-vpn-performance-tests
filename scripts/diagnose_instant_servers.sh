#!/bin/bash
# Instant Servers Diagnostic Script
# Purpose: Quick health check of TEST environment Instant servers
# Usage: ./diagnose_instant_servers.sh

set -e

echo "========================================"
echo "Skipr Instant Servers Diagnostic"
echo "Environment: TEST"
echo "========================================"
echo ""

S3_TARGETS="https://skipr-shared-test.s3.us-west-2.amazonaws.com/targets_instant.json"
S3_AGENTS="https://skipr-shared-test.s3.us-west-2.amazonaws.com/agents.json"

# Colors
RED='\033[0;31m'
GREEN='\033[0;32m'
YELLOW='\033[1;33m'
NC='\033[0m' # No Color

# Function to check HTTP status
check_server() {
    local ip=$1
    local name=$2

    echo -n "Checking $name ($ip)... "

    http_code=$(curl -sk -o /dev/null -w "%{http_code}" "https://${ip}/?device_id=test&protocol=wireguard" --max-time 10)

    if [ "$http_code" -eq 200 ]; then
        echo -e "${GREEN}✓ OK (HTTP $http_code)${NC}"
        return 0
    elif [ "$http_code" -eq 502 ]; then
        echo -e "${RED}✗ BAD GATEWAY (HTTP $http_code) - Backend service down${NC}"
        return 1
    elif [ "$http_code" -eq 000 ]; then
        echo -e "${RED}✗ CONNECTION FAILED - Server unreachable${NC}"
        return 1
    else
        echo -e "${YELLOW}⚠ UNEXPECTED (HTTP $http_code)${NC}"
        return 1
    fi
}

echo "Step 1: Fetching S3 configuration..."
echo "--------------------------------------------"

# Fetch targets
if ! targets_json=$(curl -s "$S3_TARGETS"); then
    echo -e "${RED}✗ Failed to fetch targets_instant.json${NC}"
    exit 1
fi

echo -e "${GREEN}✓ targets_instant.json fetched successfully${NC}"

# Parse targets (basic parsing without jq for portability)
valid_from=$(echo "$targets_json" | grep -o '"valid_from"[[:space:]]*:[[:space:]]*"[^"]*"' | cut -d'"' -f4)
echo "Last Updated: $valid_from"

if [ -z "$valid_from" ]; then
    echo -e "${YELLOW}⚠ Warning: Could not parse valid_from timestamp${NC}"
fi

echo ""
echo "Step 2: Checking Instant Servers..."
echo "--------------------------------------------"

# Extract IPs and names (basic parsing)
# This is a simplified version - in production use jq
switzerland_ip="51.96.97.102"
japan_ip="43.207.157.163"

check_server "$switzerland_ip" "Switzerland (Zurich)"
switzerland_status=$?

check_server "$japan_ip" "Japan (Tokyo)"
japan_status=$?

echo ""
echo "Step 3: Checking Agent..."
echo "--------------------------------------------"

# Fetch agents
if ! agents_json=$(curl -s "$S3_AGENTS"); then
    echo -e "${RED}✗ Failed to fetch agents.json${NC}"
    exit 1
fi

echo -e "${GREEN}✓ agents.json fetched successfully${NC}"

# Extract agent IP
agent_ip=$(echo "$agents_json" | grep -o '"ip_address"[[:space:]]*:[[:space:]]*"[^"]*"' | head -1 | cut -d'"' -f4)

if [ -n "$agent_ip" ]; then
    echo -n "Checking Agent ($agent_ip)... "

    agent_status=$(curl -sk -o /dev/null -w "%{http_code}" "https://${agent_ip}:443/status" --max-time 10)

    if [ "$agent_status" -eq 200 ] || [ "$agent_status" -eq 404 ]; then
        echo -e "${GREEN}✓ Reachable (HTTP $agent_status)${NC}"
    else
        echo -e "${RED}✗ Unreachable or error (HTTP $agent_status)${NC}"
    fi
else
    echo -e "${YELLOW}⚠ Could not parse agent IP${NC}"
fi

echo ""
echo "========================================"
echo "Summary"
echo "========================================"

total_servers=2
failed_servers=$((switzerland_status + japan_status))
operational_servers=$((total_servers - failed_servers))

echo "Total Instant Servers: $total_servers"
echo -e "Operational: ${GREEN}$operational_servers${NC}"
echo -e "Failed: ${RED}$failed_servers${NC}"

echo ""

if [ $failed_servers -eq 0 ]; then
    echo -e "${GREEN}✓ All systems operational${NC}"
    echo ""
    echo "You can now run performance tests:"
    echo "  cd api_e2e_tests"
    echo "  npm test -- --maxWorkers=5"
    exit 0
elif [ $failed_servers -eq $total_servers ]; then
    echo -e "${RED}✗ CRITICAL: All Instant servers are down${NC}"
    echo ""
    echo "Action Required:"
    echo "  1. Check if EC2 instances are running (AWS Console)"
    echo "  2. SSH into servers and check service status"
    echo "  3. Review ISSUE_INSTANT_SERVERS_DOWN.md for detailed steps"
    exit 1
else
    echo -e "${YELLOW}⚠ WARNING: Some Instant servers are down${NC}"
    echo ""
    echo "Action Required:"
    echo "  1. Investigate failed servers"
    echo "  2. Consider removing failed servers from targets_instant.json temporarily"
    echo "  3. Review ISSUE_INSTANT_SERVERS_DOWN.md for detailed steps"
    exit 1
fi
