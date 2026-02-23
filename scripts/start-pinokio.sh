#!/bin/bash
# Helper script to start ACE-Step UI with Pinokio installation
# Sets ACESTEP_PATH to the Pinokio installation and runs start-all.sh

ACESTEP_PATH="$HOME/pinokio/api/ace-step-ui.pinokio.git/app/ACE-Step-1.5"

echo "Setting ACESTEP_PATH to: $ACESTEP_PATH"
echo ""

export ACESTEP_PATH
exec ./start-all.sh
