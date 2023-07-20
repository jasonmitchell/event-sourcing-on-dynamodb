#! /bin/sh

./scripts/build.sh

if [ $? -ne 0 ]; then
  echo "Build failed"
  exit 1
fi

if [ ! -f "secrets.json" ]; then
  echo "secrets.json not found, creating a new one"
  API_KEY=$(openssl rand -base64 32)
  echo "{\"api_key\": \"$API_KEY\"}" | jq . > secrets.json

  if [ $? -ne 0 ]; then
    echo "Deploy failed"
    exit 1
  fi
fi

export API_KEY=$(cat ./secrets.json | jq '.api_key' | sed -e 's/^"//' -e 's/"$//')
export PULUMI_CONFIG_PASSPHRASE=
export $(cat .env | xargs) > /dev/null

if [[ -z "${PULUMI_BACKEND_URL}" ]]; then
  echo "PULUMI_BACKEND_URL is not set, using local stack management"
  pulumi login --local > /dev/null
else
  pulumi login $PULUMI_BACKEND_URL
fi

pulumi up --skip-preview --stack event-sourcing-dev