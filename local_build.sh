#!/bin/bash
npm install
git clone https://github.com/pardo/youtube-dj.git
cd youtube-dj
npm install
npm run build
echo "now you can run the project with 'node index.js'"