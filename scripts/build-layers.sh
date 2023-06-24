#! /bin/sh

if [ ! -d "infra/layers/aws-sdk/node_modules" ]; then
npm ci --prefix infra/layers/aws-sdk
fi