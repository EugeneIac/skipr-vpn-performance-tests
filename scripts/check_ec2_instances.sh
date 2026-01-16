#!/bin/bash
# AWS EC2 Instance Status Checker for Instant Servers
# Purpose: Check if EC2 instances behind Instant server IPs are running
# Prerequisites: AWS CLI configured with appropriate credentials
# Usage: ./check_ec2_instances.sh

set -e

echo "========================================"
echo "AWS EC2 Instance Status Check"
echo "Skipr TEST Instant Servers"
echo "========================================"
echo ""

# Instant server IPs
SWITZERLAND_IP="51.96.97.102"
JAPAN_IP="43.207.157.163"

# Colors
RED='\033[0;31m'
GREEN='\033[0;32m'
YELLOW='\033[1;33m'
BLUE='\033[0;34m'
NC='\033[0m' # No Color

# Check if AWS CLI is installed
if ! command -v aws &> /dev/null; then
    echo -e "${RED}✗ AWS CLI is not installed${NC}"
    echo "Install it with: pip install awscli"
    echo "Or visit: https://aws.amazon.com/cli/"
    exit 1
fi

echo -e "${GREEN}✓ AWS CLI found${NC}"
echo ""

# Check AWS credentials
if ! aws sts get-caller-identity &> /dev/null; then
    echo -e "${RED}✗ AWS credentials not configured${NC}"
    echo "Configure with: aws configure"
    exit 1
fi

aws_identity=$(aws sts get-caller-identity --query 'Account' --output text)
echo -e "${GREEN}✓ AWS credentials configured (Account: $aws_identity)${NC}"
echo ""

# Function to check instance by IP
check_instance() {
    local ip=$1
    local name=$2

    echo "--------------------------------------------"
    echo -e "${BLUE}Checking $name ($ip)${NC}"
    echo "--------------------------------------------"

    # Find instance by public IP
    instance_info=$(aws ec2 describe-instances \
        --filters "Name=ip-address,Values=$ip" \
        --query 'Reservations[0].Instances[0].[InstanceId,State.Name,InstanceType,LaunchTime,Placement.AvailabilityZone]' \
        --output text 2>/dev/null)

    if [ -z "$instance_info" ] || [ "$instance_info" == "None" ]; then
        echo -e "${YELLOW}⚠ No instance found with IP $ip${NC}"
        echo "Possible reasons:"
        echo "  - Instance is in a different AWS region (try --region parameter)"
        echo "  - Instance was terminated"
        echo "  - IP is not the public IP (might be Elastic IP)"
        echo ""
        return 1
    fi

    # Parse instance info
    instance_id=$(echo "$instance_info" | awk '{print $1}')
    instance_state=$(echo "$instance_info" | awk '{print $2}')
    instance_type=$(echo "$instance_info" | awk '{print $3}')
    launch_time=$(echo "$instance_info" | awk '{print $4}')
    availability_zone=$(echo "$instance_info" | awk '{print $5}')

    echo "Instance ID: $instance_id"
    echo "Instance Type: $instance_type"
    echo "Availability Zone: $availability_zone"
    echo "Launch Time: $launch_time"
    echo -n "State: "

    case "$instance_state" in
        running)
            echo -e "${GREEN}✓ RUNNING${NC}"
            echo ""
            echo "Instance is running. If server returns 502, check:"
            echo "  1. SSH into server: ssh ubuntu@$ip"
            echo "  2. Check services: sudo systemctl status"
            echo "  3. Check logs: sudo journalctl -xe"
            return 0
            ;;
        stopped)
            echo -e "${RED}✗ STOPPED${NC}"
            echo ""
            echo "Action: Start the instance"
            echo "  aws ec2 start-instances --instance-ids $instance_id"
            echo ""
            return 1
            ;;
        stopping)
            echo -e "${YELLOW}⚠ STOPPING${NC}"
            echo ""
            return 1
            ;;
        pending)
            echo -e "${YELLOW}⚠ PENDING (starting up)${NC}"
            echo ""
            return 1
            ;;
        shutting-down)
            echo -e "${RED}✗ SHUTTING DOWN${NC}"
            echo ""
            return 1
            ;;
        terminated)
            echo -e "${RED}✗ TERMINATED${NC}"
            echo ""
            echo "Instance was terminated. Need to provision new instance."
            return 1
            ;;
        *)
            echo -e "${YELLOW}⚠ UNKNOWN STATE: $instance_state${NC}"
            echo ""
            return 1
            ;;
    esac
}

# Check both instances
check_instance "$SWITZERLAND_IP" "Switzerland (Zurich)"
switzerland_result=$?

check_instance "$JAPAN_IP" "Japan (Tokyo)"
japan_result=$?

# Summary
echo "========================================"
echo "Summary"
echo "========================================"

if [ $switzerland_result -eq 0 ] && [ $japan_result -eq 0 ]; then
    echo -e "${GREEN}✓ Both instances are running${NC}"
    echo ""
    echo "If you're still seeing 502 errors, the problem is with the application"
    echo "services, not the EC2 instances. SSH into servers and check service status."
    exit 0
elif [ $switzerland_result -ne 0 ] && [ $japan_result -ne 0 ]; then
    echo -e "${RED}✗ Both instances have issues${NC}"
    echo ""
    echo "Quick fix command (if both are stopped):"
    echo "  # Get instance IDs first, then:"
    echo "  aws ec2 start-instances --instance-ids <instance-id-1> <instance-id-2>"
    exit 1
else
    echo -e "${YELLOW}⚠ One or more instances have issues${NC}"
    echo ""
    echo "Review the details above and take appropriate action."
    exit 1
fi

echo ""
echo "Note: This script checks the default AWS region."
echo "If instances are in a different region, use:"
echo "  aws ec2 describe-instances --region <region> ..."
