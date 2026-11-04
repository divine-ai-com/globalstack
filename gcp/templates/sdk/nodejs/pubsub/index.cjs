const { PubSub } = require('@google-cloud/pubsub');

const runId = requireEnv('RUN_ID');
const projectId = process.env.PUBSUB_PROJECT_ID || 'globalstack-local';
const topicName = requireEnv('TOPIC_NAME');
const subscriptionName = requireEnv('SUBSCRIPTION_NAME');
const steps = [];

let topicCreated = false;
let subscriptionCreated = false;

async function main() {
  const pubsub = new PubSub({ projectId });
  const topic = pubsub.topic(topicName);
  const subscription = pubsub.subscription(subscriptionName);

  try {
    await step('topic.create', async () => {
      await pubsub.createTopic(topicName);
      topicCreated = true;
    });
    await step('subscription.create', async () => {
      await topic.createSubscription(subscriptionName);
      subscriptionCreated = true;
    });
    await step('topic.publishMessage', async () => {
      const messageId = await topic.publishMessage({
        json: {
          run_id: runId,
          purpose: 'globalstack gcp pubsub sdk node',
        },
        attributes: {
          run_id: runId,
        },
      });
      if (!messageId) throw new Error('Publish did not return a message id');
    });
    await step('subscription.pull', async () => {
      const message = await waitForMessage(subscription);
      const body = JSON.parse(message.data.toString('utf8'));
      if (body.run_id !== runId) {
        throw new Error(`Received message for run ${body.run_id}, expected ${runId}`);
      }
      message.ack();
    });
  } finally {
    if (subscriptionCreated) {
      await step('subscription.delete', async () => {
        await subscription.delete();
        subscriptionCreated = false;
      });
    }
    if (topicCreated) {
      await step('topic.delete', async () => {
        await topic.delete();
        topicCreated = false;
      });
    }
  }
}

main()
  .then(() => {
    console.log(JSON.stringify({ status: 'passed', steps }, null, 2));
  })
  .catch(error => {
    console.log(JSON.stringify({
      status: 'failed',
      error: error.message,
      steps,
    }, null, 2));
    process.exitCode = 1;
  });

async function step(name, action) {
  const started = Date.now();
  try {
    await action();
    steps.push({ name, status: 'passed', duration_ms: Date.now() - started });
  } catch (error) {
    steps.push({ name, status: 'failed', duration_ms: Date.now() - started, error: error.message });
    throw error;
  }
}

function requireEnv(name) {
  const value = process.env[name];
  if (!value) throw new Error(`Missing required environment variable ${name}`);
  return value;
}

function waitForMessage(subscription) {
  return new Promise((resolve, reject) => {
    const timeout = setTimeout(() => {
      cleanup();
      reject(new Error('Timed out waiting for Pub/Sub message'));
    }, 10000);
    const onMessage = message => {
      cleanup();
      resolve(message);
    };
    const onError = error => {
      cleanup();
      reject(error);
    };
    const cleanup = () => {
      clearTimeout(timeout);
      subscription.removeListener('message', onMessage);
      subscription.removeListener('error', onError);
    };
    subscription.on('message', onMessage);
    subscription.on('error', onError);
  });
}
