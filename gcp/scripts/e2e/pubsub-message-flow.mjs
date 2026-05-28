export async function assertPubSubMessageFlow({ endpoint, projectId, topicName, subscriptionName, runId }) {
  const baseUrl = `http://${endpoint}/v1`;
  const payload = {
    run_id: runId,
    purpose: 'globalstack gcp pubsub iac',
  };
  const encodedData = Buffer.from(JSON.stringify(payload)).toString('base64');
  const publish = await requestJson({
    method: 'POST',
    url: `${baseUrl}/projects/${projectId}/topics/${topicName}:publish`,
    body: {
      messages: [
        {
          data: encodedData,
          attributes: {
            run_id: runId,
          },
        },
      ],
    },
  });
  if (!publish.messageIds?.length) {
    throw new Error(`Pub/Sub publish did not return messageIds: ${JSON.stringify(publish)}`);
  }

  const pull = await requestJson({
    method: 'POST',
    url: `${baseUrl}/projects/${projectId}/subscriptions/${subscriptionName}:pull`,
    body: {
      maxMessages: 1,
    },
  });
  const received = pull.receivedMessages?.[0];
  if (!received?.message?.data) {
    throw new Error(`Pub/Sub pull did not return a message: ${JSON.stringify(pull)}`);
  }
  const body = JSON.parse(Buffer.from(received.message.data, 'base64').toString('utf8'));
  if (body.run_id !== runId) {
    throw new Error(`Pub/Sub pulled run ${body.run_id}, expected ${runId}`);
  }

  if (received.ackId) {
    await requestJson({
      method: 'POST',
      url: `${baseUrl}/projects/${projectId}/subscriptions/${subscriptionName}:acknowledge`,
      body: {
        ackIds: [received.ackId],
      },
    });
  }
}

async function requestJson({ method, url, body }) {
  const response = await fetch(url, {
    method,
    headers: {
      'content-type': 'application/json',
    },
    body: JSON.stringify(body),
  });
  const text = await response.text();
  const parsed = text ? JSON.parse(text) : {};
  if (!response.ok) {
    throw new Error(`${method} ${url} failed with ${response.status}: ${text}`);
  }
  return parsed;
}
