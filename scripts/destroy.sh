#! /bin/sh

export PULUMI_CONFIG_PASSPHRASE=
export $(cat .env | xargs) > /dev/null

if [[ -z "${PULUMI_BACKEND_URL}" ]]; then
  echo "PULUMI_BACKEND_URL is not set, using local stack management"
  pulumi login --local > /dev/null
else
  pulumi login $PULUMI_BACKEND_URL
fi

pulumi down --skip-preview --stack event-sourcing-dev