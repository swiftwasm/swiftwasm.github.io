#!/bin/bash

set -ex

./prod_build.sh
./node_modules/.bin/gh-pages -d dist/
