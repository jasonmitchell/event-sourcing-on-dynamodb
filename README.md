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

## Append Events to a Stream

```
curl -X PUT -i https://{api id}.execute-api.{region}.amazonaws.com/stage/streams/test-abcd1234  \
  -H "Content-Type: application/json" -d '[{"type": "EventA", "data": {"someProp": 1234}}, {"type": "EventB", "data": {"someOtherProp": "abcd"}}]' \
  -H "Authorization: ..."
```

## Read Events from a Stream

```
curl -X GET -i https://{api id}.execute-api.{region}.amazonaws.com/stage/streams/test-abcd1234  \
  -H "Authorization: ..."
```
