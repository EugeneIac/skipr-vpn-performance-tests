#!/bin/bash

# VPN Backend Performance Testing Runner
# Автоматизированный запуск всех фаз тестирования

set -e

# Colors for output
RED='\033[0;31m'
GREEN='\033[0;32m'
YELLOW='\033[1;33m'
BLUE='\033[0;34m'
NC='\033[0m' # No Color

# Configuration
BASE_URL="${BASE_URL:-https://api.skipr.network}"
RESULTS_DIR="../results/$(date +%Y%m%d_%H%M%S)"
DOCKER_DIR="../docker"

# Function to print colored messages
print_info() {
    echo -e "${BLUE}[INFO]${NC} $1"
}

print_success() {
    echo -e "${GREEN}[SUCCESS]${NC} $1"
}

print_warning() {
    echo -e "${YELLOW}[WARNING]${NC} $1"
}

print_error() {
    echo -e "${RED}[ERROR]${NC} $1"
}

# Function to check prerequisites
check_prerequisites() {
    print_info "Checking prerequisites..."

    local missing_tools=()

    if ! command -v docker &> /dev/null; then
        missing_tools+=("docker")
    fi

    if ! command -v docker-compose &> /dev/null; then
        missing_tools+=("docker-compose")
    fi

    if ! command -v k6 &> /dev/null; then
        print_warning "k6 not found locally, will use Docker version"
    fi

    if [ ${#missing_tools[@]} -ne 0 ]; then
        print_error "Missing required tools: ${missing_tools[*]}"
        exit 1
    fi

    print_success "Prerequisites check passed"
}

# Function to setup monitoring
setup_monitoring() {
    print_info "Setting up monitoring stack..."

    cd "$DOCKER_DIR"
    docker-compose up -d prometheus grafana node-exporter

    print_success "Monitoring stack started"
    print_info "Grafana: http://localhost:3000 (admin/admin)"
    print_info "Prometheus: http://localhost:9090"

    # Wait for services to be ready
    sleep 10
}

# Function to run test phase
run_test_phase() {
    local phase_name=$1
    local target_vus=$2
    local duration=$3

    print_info "Running Phase: $phase_name"
    print_info "Target VUs: $target_vus | Duration: $duration"

    local phase_dir="$RESULTS_DIR/$phase_name"
    mkdir -p "$phase_dir"

    # Run k6 test
    docker run --rm \
        --network host \
        -v "$(pwd)/scripts:/scripts" \
        -v "$phase_dir:/results" \
        -e BASE_URL="$BASE_URL" \
        -e TARGET_VUS="$target_vus" \
        -e TEST_DURATION="$duration" \
        grafana/k6:latest \
        run /scripts/vpn_api_load_test.js

    local exit_code=$?

    if [ $exit_code -eq 0 ]; then
        print_success "Phase $phase_name completed successfully"
    else
        print_error "Phase $phase_name failed with exit code $exit_code"
    fi

    # Small delay between phases
    sleep 30

    return $exit_code
}

# Function to run VPN client load test
run_vpn_client_test() {
    local num_clients=$1

    print_info "Starting $num_clients VPN clients..."

    cd "$DOCKER_DIR"
    docker-compose --profile clients up -d --scale vpn-client="$num_clients"

    print_success "VPN clients started"

    # Monitor for some time
    local monitor_duration=300  # 5 minutes
    print_info "Monitoring VPN clients for ${monitor_duration}s..."

    for ((i=0; i<monitor_duration; i+=30)); do
        local healthy=$(docker ps --filter "name=vpn-client" --filter "health=healthy" -q | wc -l)
        local total=$(docker ps --filter "name=vpn-client" -q | wc -l)
        print_info "Healthy clients: $healthy / $total"
        sleep 30
    done

    # Stop clients
    print_info "Stopping VPN clients..."
    docker-compose --profile clients down
}

# Function to generate report
generate_report() {
    print_info "Generating test report..."

    local report_file="$RESULTS_DIR/test_report.md"

    cat > "$report_file" <<EOF
# VPN Backend Performance Test Report
**Date:** $(date)
**Base URL:** $BASE_URL

## Test Summary

EOF

    # Add results from each phase
    for phase_dir in "$RESULTS_DIR"/*; do
        if [ -d "$phase_dir" ]; then
            local phase_name=$(basename "$phase_dir")
            echo "### $phase_name" >> "$report_file"

            if [ -f "$phase_dir/summary.json" ]; then
                echo "\`\`\`json" >> "$report_file"
                cat "$phase_dir/summary.json" >> "$report_file"
                echo "\`\`\`" >> "$report_file"
            fi

            echo "" >> "$report_file"
        fi
    done

    print_success "Report generated: $report_file"
}

# Function to cleanup
cleanup() {
    print_info "Cleaning up..."

    cd "$DOCKER_DIR"
    docker-compose --profile clients down
    docker-compose down

    print_success "Cleanup completed"
}

# Main execution
main() {
    echo "========================================"
    echo "VPN Backend Performance Testing Suite"
    echo "========================================"
    echo ""

    # Create results directory
    mkdir -p "$RESULTS_DIR"

    # Check prerequisites
    check_prerequisites

    # Setup monitoring
    setup_monitoring

    # Run test phases
    print_info "Starting test phases..."
    echo ""

    # Phase 1: Baseline Testing
    run_test_phase "phase1_baseline" 50 "10m" || true

    # Phase 2: Load Testing
    run_test_phase "phase2_load" 200 "15m" || true

    # Phase 3: Stress Testing
    run_test_phase "phase3_stress" 500 "15m" || true

    # Phase 4: Spike Testing
    run_test_phase "phase4_spike" 1000 "10m" || true

    # Optional: VPN Client Load Test
    read -p "Run VPN client load test? (y/n) " -n 1 -r
    echo
    if [[ $REPLY =~ ^[Yy]$ ]]; then
        read -p "Number of clients: " num_clients
        run_vpn_client_test "$num_clients"
    fi

    # Generate report
    generate_report

    # Keep monitoring running
    print_success "All tests completed!"
    print_info "Results saved to: $RESULTS_DIR"
    print_info "Monitoring stack is still running. Access Grafana at http://localhost:3000"
    print_warning "Run 'docker-compose down' in $DOCKER_DIR to stop monitoring"

    # Optional cleanup
    read -p "Stop monitoring stack now? (y/n) " -n 1 -r
    echo
    if [[ $REPLY =~ ^[Yy]$ ]]; then
        cleanup
    fi
}

# Trap errors and cleanup
trap cleanup ERR

# Run main
main "$@"
