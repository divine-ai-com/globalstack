import { randomUUID } from 'node:crypto';
import { storedResource, queueSenderAuthorized, systemTopicDestination, systemTopicDeadLetter,
  blobDeadLetterAuthorized, storageEventMatches } from '../../core/src/event-grid-storage-contract.mjs';

// Local retry scheduling is bounded but is not a claim of Azure timing parity.
const delays = [10000, 30000, 60000, 300000, 600000];
export class StorageEventDelivery {
  constructor({ store, storageRouter, now = Date.now, schedule = setTimeout, cancel = clearTimeout }) {
    this.store = store; this.storageRouter = storageRouter; this.now = now; this.schedule = schedule; this.cancel = cancel;
    this.pending = new Map(); this.deadLetters = new Map(); this.diagnostics = []; this.timer = null; this.sequences = new Map();
    this.inFlight = new Map(); this.disposed = false;
  }

  record(item, state, reason) {
    this.diagnostics.push({ eventId: item.event.id, subscriptionId: item.subscriptionId, attempts: item.attempts, state, reason, at: new Date(this.now()).toISOString() });
    if (this.diagnostics.length > 1000) this.diagnostics.shift();
  }

  publish({ account, blob, api, requestId, clientRequestId }) {
    if (this.disposed) return;
    if (!account.resourceId || ['$logs', '$blobchangefeed'].includes(blob.containerName)) return;
    const source = account.resourceId;
    const sequenceKey = `${source.toLowerCase()}/${blob.containerName}/${blob.blobName}`;
    const sequence = (this.sequences.get(sequenceKey) ?? 0n) + 1n;
    this.sequences.set(sequenceKey, sequence);
    const event = { topic: source, subject: `/blobServices/default/containers/${blob.containerName}/blobs/${blob.blobName}`,
      eventType: api === 'PutBlob' ? 'Microsoft.Storage.BlobCreated' : 'Microsoft.Storage.BlobDeleted',
      id: randomUUID(), eventTime: new Date(this.now()).toISOString(), dataVersion: '', metadataVersion: '1',
      data: { api, requestId, ...(clientRequestId ? { clientRequestId } : {}),
        ...(api === 'PutBlob' ? { eTag: blob.etag.replaceAll('"', ''), contentLength: blob.body.length } : {}),
        contentType: blob.contentType, blobType: 'BlockBlob', accessTier: 'Default',
        url: `https://${account.accountName}.blob.core.windows.net/${encodeURIComponent(blob.containerName)}/${blob.blobName.split('/').map(encodeURIComponent).join('/')}`,
        sequencer: sequence.toString(16).toUpperCase().padStart(32, '0'), storageDiagnostics: { batchId: randomUUID() } } };
    for (const resource of this.store.resources.values()) {
      if (resource.type !== 'Microsoft.EventGrid/systemTopics/eventSubscriptions') continue;
      const topic = storedResource(this.store, resource.id.slice(0, resource.id.lastIndexOf('/eventSubscriptions/')));
      if (topic?.properties?.source?.toLowerCase() !== source.toLowerCase() || !storageEventMatches(event, resource.properties?.filter)) continue;
      const item = { event, subscriptionId: resource.id, topicId: topic.id, attempts: 0, next: this.now(),
        expires: this.now() + (resource.properties?.retryPolicy?.eventTimeToLiveInMinutes ?? 1440) * 60000,
        maxAttempts: resource.properties?.retryPolicy?.maxDeliveryAttempts ?? 30 };
      this.pending.set(`${resource.id}:${event.id}`, item);
    }
    this.drain();
  }

  drain() {
    if (this.disposed) return;
    if (this.timer !== null) { this.cancel(this.timer); this.timer = null; }
    for (const [key, item] of this.pending) {
      if (item.expires <= this.now()) {
        this.inFlight.get(key)?.abort(); this.record(item, 'expired'); this.pending.delete(key);
        this.scheduleDeadLetter(key, item, 'TimeToLiveExceeded', 'TimeToLiveExceeded'); continue;
      }
      if (this.inFlight.has(key)) continue;
      if (item.next > this.now()) continue;
      const subscription = storedResource(this.store, item.subscriptionId), topic = storedResource(this.store, item.topicId);
      if (!subscription || !topic) { this.record(item, 'canceled', 'Subscription or topic removed'); this.pending.delete(key); continue; }
      if (subscription.properties?.destination?.endpointType === 'AzureFunction') {
        if (this.inFlight.size >= 8) continue;
        item.attempts++;
        const functionId = subscription.properties.destination.properties?.resourceId;
        const siteId = /^(.*)\/functions\/[^/]+$/i.exec(functionId ?? '')?.[1];
        const site = storedResource(this.store, siteId);
        if (!site || site.properties?.publicNetworkAccess === 'Disabled'
          || !this.functionsRouter?.hasNativeEventGridFunction(functionId)) {
          this.complete(key, item, 'NativeFunctionDestinationUnavailable'); continue;
        }
        const controller = new AbortController(); this.inFlight.set(key, controller);
        Promise.resolve(this.functionsRouter.deliverEventGrid(functionId, item.event, { signal: controller.signal }))
          .then(result => {
            if (this.pending.get(key) !== item || this.disposed) return;
            if (!storedResource(this.store, item.subscriptionId) || !storedResource(this.store, item.topicId)) {
              this.record(item, 'canceled', 'Subscription or topic removed'); this.pending.delete(key); return;
            }
            this.complete(key, item, result.reason);
          }, () => { if (!this.disposed && this.pending.get(key) === item) this.complete(key, item, 'NativeEventGridUnavailable'); })
          .finally(() => { this.inFlight.delete(key); this.drain(); });
        continue;
      }
      item.attempts++;
      const { account, queue, queueId, principal, destination } = systemTopicDestination(this.store, topic, subscription.properties);
      let reason;
      if (!queue || !account) reason = 'DestinationNotFound';
      else if (!queueSenderAuthorized(this.store, principal, queueId)) reason = 'AuthorizationFailed';
      else if (account.properties?.publicNetworkAccess === 'Disabled'
        || account.properties?.networkAcls?.defaultAction === 'Deny' && !String(account.properties.networkAcls.bypass).split(',').map(value => value.trim()).includes('AzureServices')) reason = 'NetworkAccessDenied';
      else {
        try {
          this.storageRouter.enqueueMessage({ accountName: account.name, queueName: destination.properties.queueName,
            text: Buffer.from(JSON.stringify(item.event)).toString('base64'), ttl: destination.properties.queueMessageTimeToLiveInSeconds ?? 604800 });
        } catch (error) { reason = error.code ?? 'DeliveryFailed'; }
      }
      this.complete(key, item, reason);
    }
    for (const [key, pending] of this.deadLetters) {
      if (pending.due > this.now()) continue;
      this.deadLetters.delete(key);
      const { item } = pending, subscription = storedResource(this.store, item.subscriptionId);
      const topic = storedResource(this.store, item.topicId);
      if (!subscription || !topic) { this.record(item, 'deadletter-canceled', 'Subscription or topic removed'); continue; }
      const { account, container, containerId, destination, principal } = systemTopicDeadLetter(this.store, topic, subscription.properties);
      let reason;
      if (!account || !container) reason = 'DestinationNotFound';
      else if (!blobDeadLetterAuthorized(this.store, principal, containerId)) reason = 'AuthorizationFailed';
      else if (account.properties?.publicNetworkAccess === 'Disabled'
        || account.properties?.networkAcls?.defaultAction === 'Deny' && !String(account.properties.networkAcls.bypass).split(',').map(value => value.trim()).includes('AzureServices')) reason = 'NetworkAccessDenied';
      else {
        const now = new Date(this.now());
        const name = `${item.subscriptionId.split('/').at(-1).toUpperCase()}/${now.getUTCFullYear()}/${now.getUTCMonth() + 1}/${now.getUTCDate()}/${now.getUTCHours()}/${randomUUID()}.json`;
        const event = { ...item.event, deadLetterReason: pending.terminalReason, deliveryAttempts: item.attempts,
          lastDeliveryOutcome: pending.lastOutcome, publishTime: item.event.eventTime,
          lastDeliveryAttemptTime: now.toISOString() };
        try {
          this.storageRouter.writeSystemBlob({ accountName: account.name, containerName: destination.properties.blobContainerName,
            blobName: name, body: Buffer.from(JSON.stringify([event])) });
        } catch (error) { reason = error.code ?? 'DeadLetterWriteFailed'; }
      }
      if (!reason) this.record(item, 'deadlettered');
      else if (this.now() - pending.firstDue >= 4 * 60 * 60 * 1000) this.record(item, 'deadletter-dropped', reason);
      else {
        pending.attempts++;
        pending.due = this.now() + [10000, 60000, 300000][Math.min(pending.attempts - 1, 2)];
        this.deadLetters.set(key, pending);
        this.record(item, 'deadletter-retrying', reason);
      }
    }
    if (this.pending.size || this.deadLetters.size) {
      const next = Math.min(...[...this.pending.entries()].map(([key, item]) => this.inFlight.has(key) || this.inFlight.size >= 8 ? item.expires : Math.min(item.next, item.expires)),
        ...[...this.deadLetters.values()].map(item => item.due));
      this.timer = this.schedule(() => this.drain(), Math.max(1, next - this.now()));
      this.timer?.unref?.();
    }
  }

  complete(key, item, reason) {
    if (!reason) { this.record(item, 'delivered'); this.pending.delete(key); }
    else if (item.attempts >= item.maxAttempts) {
      this.record(item, 'exhausted', reason); this.pending.delete(key);
      this.scheduleDeadLetter(key, item, 'MaxDeliveryAttemptsExceeded', reason);
    }
    else { this.record(item, 'retrying', reason); item.next = this.now() + delays[Math.min(item.attempts - 1, delays.length - 1)]; }
  }

  scheduleDeadLetter(key, item, terminalReason, lastOutcome) {
    if (!storedResource(this.store, item.subscriptionId)?.properties?.deadLetterWithResourceIdentity) return;
    const due = this.now() + 300000;
    this.deadLetters.set(key, { item, terminalReason, lastOutcome, due, firstDue: due, attempts: 0 });
    this.record(item, 'deadletter-pending', terminalReason);
  }

  dispose() {
    this.disposed = true;
    if (this.timer !== null) this.cancel(this.timer);
    for (const controller of this.inFlight.values()) controller.abort();
    this.inFlight.clear(); this.timer = null; this.pending.clear(); this.deadLetters.clear(); this.sequences.clear();
  }
}
