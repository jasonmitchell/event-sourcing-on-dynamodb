#! /bin/sh

export PULUMI_CONFIG_PASSPHRASE=

pulumi login --local > /dev/null
pulumi down --skip-preview --stack event-sourcing-dev