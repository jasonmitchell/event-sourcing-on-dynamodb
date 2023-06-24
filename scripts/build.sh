#! /bin/sh

rm -rf dist

node ./scripts/build-api.mjs
if [ $? -ne 0 ]; then
  echo "Build failed"
  exit 1
fi

./scripts/build-layers.sh
if [ $? -ne 0 ]; then
  echo "Build failed"
  exit 2
fi
