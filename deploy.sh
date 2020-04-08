#!/bin/bash

rm -rf dist
mkdir -p dist
cp -rf public/* dist/
npm run build
./node_modules/.bin/gh-pages -d dist/
