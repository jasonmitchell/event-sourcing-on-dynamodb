# Event Sourcing in DynamoDB

## Prerequisites

- [pnpm](https://pnpm.io/)

## Getting Started

Run the following command to deploy the full infrastructure and service:

```bash
./up.sh
```

By default Pulumi will manage stack state on the local file system. To use an S3 backend,
create a new or use and existing S3 bucket andcreate a `.env` file at the repository root
with the following contents:

```
PULUMI_BACKEND_URL=s3://your-bucket-name
```

The stack can be torn down using the following command:

```bash
./scripts/destroy.sh
```

## Make a request

```

curl -X POST -i  https://{api id}.execute-api.{region}.amazonaws.com/stage/reservations  \               ✔
  -H "Content-Type: application/json" -d '{"customerId": "abcd1234", "seats": ["A1","A2"]}' \
  -H "Authorization: {api_key from secrets.json"
```

## Run Local
```bash
sam local start-api -t template.yaml
```
