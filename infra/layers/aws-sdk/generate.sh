#! /bin/sh

AWS_SDK_DEPS=$(cat package.json | jq '.dependencies | with_entries(select(.key | startswith("@aws-sdk/")))')

pushd ./infra/layers/aws-sdk > /dev/null
echo "{\"name\": \"layer-aws-sdk\", \"dependencies\": $AWS_SDK_DEPS}" | jq . > ./package.json
npm install > /dev/null
popd > /dev/null
