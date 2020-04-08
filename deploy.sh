#!/bin/bash

npm run build
cp -rf demo_compiled dist/demo_compiled
cp CNAME dist/CNAME

./node_modules/.bin/gh-pages -d dist/
