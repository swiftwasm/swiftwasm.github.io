#!/bin/bash

npm run build
cp -rf demo_compiled dist/demo_compiled

git subtree push --prefix dist/ origin gh-pages
