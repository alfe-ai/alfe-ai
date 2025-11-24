#!/bin/bash

sudo apt update
sudo apt install git nodejs npm -y
rm -rf alfe-ai-Aurelix
git clone https://github.com/alfe-ai
cd alfe-ai-Aurelix
#git checkout Aurora/Aurelix/dev/main-rel2
cp ../.env Aurora/.env
./run_full.sh
