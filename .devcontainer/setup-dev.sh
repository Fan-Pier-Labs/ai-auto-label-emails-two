#!/bin/bash
set -e

echo "Setting up development environment..."

# Update package list
apt-get update -y

# Install all development tools
echo "Installing development tools..."
apt-get install -y --no-install-recommends \
    ca-certificates curl wget gnupg \
    git git-lfs openssh-client rsync unzip zip xz-utils jq \
    build-essential make cmake \
    libssl-dev libbz2-dev libreadline-dev libsqlite3-dev zlib1g-dev \
    python3 python3-pip \
    bash zsh fish vim nano \
    htop strace \
    tzdata

# Git LFS init (only if git is available)
if command -v git &> /dev/null; then
    git lfs install || true
else
    echo "Warning: git not available, skipping git-lfs setup"
fi

# Install Cursor (only if curl is available)
if command -v curl &> /dev/null; then
    echo "Installing Cursor..."
    curl https://cursor.com/install -fsS | bash || echo "Cursor installation failed, continuing..."
else
    echo "Warning: curl not available, skipping Cursor installation"
fi

# Install AWS CLI (architecture-aware, only if curl and unzip are available)
if command -v curl &> /dev/null && command -v unzip &> /dev/null; then
    echo "Installing AWS CLI..."
    ARCH=$(dpkg --print-architecture)
    if [ "$ARCH" = "amd64" ]; then
        AWS_CLI_URL="https://awscli.amazonaws.com/awscli-exe-linux-x86_64.zip"
    elif [ "$ARCH" = "arm64" ]; then
        AWS_CLI_URL="https://awscli.amazonaws.com/awscli-exe-linux-aarch64.zip"
    else
        echo "Unsupported architecture: $ARCH, skipping AWS CLI"
    fi
    
    if [ -n "${AWS_CLI_URL:-}" ]; then
        curl "$AWS_CLI_URL" -o "awscliv2.zip" && \
        unzip -q awscliv2.zip && \
        ./aws/install && \
        rm -rf awscliv2.zip aws || echo "AWS CLI installation failed, continuing..."
    fi
else
    echo "Warning: curl or unzip not available, skipping AWS CLI installation"
fi

# Install GitHub CLI
# if you want this to be authorized to your github account and you are on a mac and use fish cli (fish shell)
# get a token (gh auth token) and put it at ~/.config/gh/gh_token
# then set up this alias on your mac and it will work in both mac and container
# https://github.com/ryanhugh/fish_config/blob/master/gh.fish

if command -v curl &> /dev/null; then
    echo "Installing GitHub CLI..."
    ARCH=$(dpkg --print-architecture)
    if [ "$ARCH" = "amd64" ]; then
        GH_ARCH="amd64"
    elif [ "$ARCH" = "arm64" ]; then
        GH_ARCH="arm64"
    else
        echo "Unsupported architecture: $ARCH, skipping GitHub CLI"
        GH_ARCH=""
    fi
    
    if [ -n "$GH_ARCH" ]; then
        curl -fsSL https://cli.github.com/packages/githubcli-archive-keyring.gpg | dd of=/usr/share/keyrings/githubcli-archive-keyring.gpg && \
        chmod go+r /usr/share/keyrings/githubcli-archive-keyring.gpg && \
        echo "deb [arch=$GH_ARCH signed-by=/usr/share/keyrings/githubcli-archive-keyring.gpg] https://cli.github.com/packages stable main" > /etc/apt/sources.list.d/github-cli.list && \
        apt-get update -qq && \
        apt-get install -y --no-install-recommends gh || echo "GitHub CLI installation failed, continuing..."
    fi
else
    echo "Warning: curl not available, skipping GitHub CLI installation"
fi

# Set fish as default shell
echo "Setting fish as default shell..."
if command -v fish &> /dev/null; then
    FISH_PATH=$(command -v fish)
    usermod -s "$FISH_PATH" root || echo "Warning: Failed to set fish as default shell"
    
    # Configure fish to use a writable location for universal variables
    # Since /root/.config/fish is mounted read-only, create a writable config directory
    mkdir -p /root/.local/config/fish
    
    # Copy config files from read-only mount if they exist
    if [ -d /root/.config/fish ] && [ "$(ls -A /root/.config/fish 2>/dev/null)" ]; then
        cp -r /root/.config/fish/* /root/.local/config/fish/ 2>/dev/null || true
    fi
    
    # Set XDG_CONFIG_HOME so fish uses /root/.local/config for its config (including fish_variables)
    echo "export XDG_CONFIG_HOME=/root/.local/config" >> /root/.bashrc
    echo "export XDG_CONFIG_HOME=/root/.local/config" >> /root/.profile
    
    # Also set SHELL environment variable
    echo "export SHELL=$FISH_PATH" >> /root/.bashrc
    echo "export SHELL=$FISH_PATH" >> /root/.profile
else
    echo "Warning: fish not found, skipping shell setup"
fi

# Install dev dependencies (not production deps)
echo "Installing development dependencies..."
bun install

echo "Development environment setup complete!"
