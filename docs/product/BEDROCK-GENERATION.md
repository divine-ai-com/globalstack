# Bedrock Generation

Use this when a task explicitly requires generating bundle content with Amazon Bedrock instead of another model path.

## What Worked

For the Azure Pulumi bundle task `verified/7a4bc9d2-3fe4-4c53-bf86-3b44ac79b301/Pr91005`, the working generation path was:

- provider: Amazon Bedrock
- model family: Anthropic Claude
- model ID: `anthropic.claude-opus-4-7`
- global inference ID: `global.anthropic.claude-opus-4-7`
- API: `InvokeModelWithResponseStream`
- payload shape: Anthropic Messages API for Bedrock

This was used to generate only:

- `verified/7a4bc9d2-3fe4-4c53-bf86-3b44ac79b301/Pr91005/lib/tap-stack.ts`

## Why This Path

The local Python environment had `boto3` and `botocore`, but:

- the AWS CLI was not installed
- the installed botocore did not expose the newer `converse` helper on the Bedrock runtime client

So the correct fallback was:

1. use `boto3`
2. call `bedrock-runtime`
3. use `InvokeModelWithResponseStream`
4. send the Anthropic Messages request body directly

## Credential Loading Rule

Credentials were loaded from:

- `/home/ubuntu/secrets/env/.env`

Do not print or persist secrets from that file.

Important nuance:

- the env file contained `AWS_PROFILE`
- that profile was not present locally
- profile-based resolution failed with `ProfileNotFound`

So the working technique is:

- read `AWS_ACCESS_KEY_ID`
- read `AWS_SECRET_ACCESS_KEY`
- optionally read `AWS_SESSION_TOKEN`
- read `AWS_REGION` or `AWS_DEFAULT_REGION`
- create the `boto3.Session(...)` with those explicit values
- ignore `AWS_PROFILE` for this direct Bedrock call unless the profile is actually installed on the machine

## Request Format

Use the Bedrock Anthropic Messages request body:

```json
{
  "anthropic_version": "bedrock-2023-05-31",
  "max_tokens": 12000,
  "messages": [
    {
      "role": "user",
      "content": [
        {
          "type": "text",
          "text": "..."
        }
      ]
    }
  ]
}
```

Notes:

- `temperature` was rejected for this model path in the local environment and should be omitted unless revalidated
- use a long read timeout when invoking Opus through Bedrock

## Streaming Rule

Use `InvokeModelWithResponseStream` and collect the streamed deltas.

For Anthropic streaming events, the text content came through:

- `content_block_delta` -> `delta.text`

Also capture:

- `message_delta` -> `delta.stop_reason`
- `metadata` -> usage

## File-Targeting Rule

When generating a single file for a verified bundle:

- tell the model to generate only that file
- forbid markdown fences
- forbid prose
- forbid generating any additional files

For this task, the effective instruction was:

- generate only `lib/tap-stack.ts`
- keep the Function App implementation inside the same file
- do not assume a separate `function-app` folder

## Python Pattern

Use this pattern as the baseline:

```python
from botocore.config import Config
import boto3
import json

config = Config(read_timeout=900, connect_timeout=30, retries={"max_attempts": 2, "mode": "standard"})
session = boto3.Session(
    aws_access_key_id=...,
    aws_secret_access_key=...,
    aws_session_token=...,
    region_name=...,
)
client = session.client("bedrock-runtime", region_name=region, config=config)

resp = client.invoke_model_with_response_stream(
    modelId="global.anthropic.claude-opus-4-7",
    contentType="application/json",
    accept="application/json",
    body=json.dumps(body).encode("utf-8"),
)
```

Then iterate the stream and concatenate `content_block_delta` text chunks.

## Failure Modes Seen

These failures already happened and should not be rediscovered:

1. `ProfileNotFound`
   - cause: env file set `AWS_PROFILE` but that profile was not installed locally
   - fix: use explicit access key / secret key session values

2. `AttributeError: 'BedrockRuntime' object has no attribute 'converse'`
   - cause: older botocore
   - fix: use `invoke_model` or `invoke_model_with_response_stream`

3. `ValidationException: temperature is deprecated for this model`
   - cause: request body included `temperature`
   - fix: omit `temperature`

4. `ReadTimeoutError` on `InvokeModel`
   - cause: non-streaming call timed out while waiting for Opus output
   - fix: use `InvokeModelWithResponseStream` with higher read timeout

## Output Validation

After writing the file:

1. sanity-read the top of the file
2. sanity-read the tail of the file
3. check line count or size
4. do not assume the model output is correct just because streaming completed

The Bedrock call proves provenance, not correctness.

## Scope Constraint

This technique is for model generation only.

It does not replace:

- unit test alignment review
- integration test design
- parity validation against GlobalStack
- source-quality review before accepting a verified bundle
