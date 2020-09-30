#!/bin/bash

set -ex

rm -rf dist
mkdir -p dist
cp -rf public/* dist/
npm run build:prod