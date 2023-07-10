# Event Sourcing in DynamoDB

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