#!/bin/bash

# Ketebe Engine Automated Setup Script
# Works on macOS and Linux

# Colors for output
RED='\033[0;31m'
GREEN='\033[0;32m'
BLUE='\033[0;34m'
NC='\033[0m' # No Color

echo -e "${BLUE}===============================================${NC}"
echo -e "${BLUE}          KETEBE ENGINE SETUP START            ${NC}"
echo -e "${BLUE}===============================================${NC}"

# 1. Check Prerequisites
echo -e "
${BLUE}[1/5] Checking prerequisites...${NC}"

if ! command -v node &> /dev/null; then
    echo -e "${RED}Error: Node.js is not installed. Please install it from https://nodejs.org/${NC}"
    exit 1
fi

if ! command -v npm &> /dev/null; then
    echo -e "${RED}Error: npm is not installed.${NC}"
    exit 1
fi

echo -e "${GREEN}✓ Node.js $(node -v) found.${NC}"
echo -e "${GREEN}✓ npm $(npm -v) found.${NC}"

# 2. Install Node.js Dependencies
echo -e "
${BLUE}[2/5] Installing Node.js dependencies...${NC}"
npm install
if [ $? -eq 0 ]; then
    echo -e "${GREEN}✓ Node.js dependencies installed successfully.${NC}"
else
    echo -e "${RED}Error: npm install failed.${NC}"
    exit 1
fi

# 3. Setup Python Backend (Optional but recommended)
echo -e "
${BLUE}[3/5] Setting up Python backend...${NC}"
if command -v python3 &> /dev/null; then
    echo -e "${GREEN}✓ Python 3 found.${NC}"
    
    # Create virtual environment if it doesn't exist
    if [ ! -d "backend/venv" ]; then
        echo "Creating virtual environment in backend/venv..."
        python3 -m venv backend/venv
    fi
    
    # Activate and install requirements
    source backend/venv/bin/activate
    echo "Installing Python requirements..."
    pip install --upgrade pip
    pip install -r backend/requirements.txt
    
    if [ $? -eq 0 ]; then
        echo -e "${GREEN}✓ Python environment ready.${NC}"
    else
        echo -e "${RED}Warning: Python requirements installation failed. AI features might be limited.${NC}"
    fi
    deactivate
else
    echo -e "${RED}Warning: Python 3 not found. Skipping backend setup (AI features will be limited).${NC}"
fi

# 4. Build AI Components
echo -e "
${BLUE}[4/5] Building AI components (RAG & Workers)...${NC}"
npm run build:corpus
npm run build:ai-worker
echo -e "${GREEN}✓ AI build scripts completed.${NC}"

# 5. Finalizing
echo -e "
${BLUE}[5/5] Finalizing setup...${NC}"
chmod +x server.js # Ensure server is executable if needed

echo -e "
${GREEN}===============================================${NC}"
echo -e "${GREEN}       SETUP COMPLETE - HAPPY CODING!          ${NC}"
echo -e "${GREEN}===============================================${NC}"
echo -e "
To start the engine, run:"
echo -e "${BLUE}  npm run server${NC} (Web mode)"
echo -e "or"
echo -e "${BLUE}  npm start${NC}      (Desktop mode)"
