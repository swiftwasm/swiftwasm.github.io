#!/bin/bash

rm -rf dist
mkdir -p dist
cp -rf public/* dist/
npm run build:prod
./node_modules/.bin/gh-pages -d dist/
