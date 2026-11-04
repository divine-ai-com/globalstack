import { createHmac } from 'node:crypto';

export const azuriteAccount = {
  name: 'devstoreaccount1',
  key: 'Eby8vdM02xNOcqFlqUwJPLlmEtlCDXJ1OUzFT50uSRZ6IFsuFq2UVErCz4I6tq/K1SZFPTOtr/KBHBeksoGMGw==',
};

function canonicalizedHeaders(headers) {
  return Object.entries(headers)
    .map(([key, value]) => [key.toLowerCase(), String(value).trim().replace(/\s+/g, ' ')])
    .filter(([key]) => key.startsWith('x-ms-'))
    .sort(([a], [b]) => a.localeCompare(b))
    .map(([key, value]) => `${key}:${value}\n`)
    .join('');
}

function canonicalizedResource(url, accountName) {
  const parts = [`/${accountName}${url.pathname}`];
  const grouped = new Map();
  for (const [key, value] of url.searchParams.entries()) {
    const lower = key.toLowerCase();
    if (!grouped.has(lower)) grouped.set(lower, []);
    grouped.get(lower).push(value);
  }
  for (const [key, values] of [...grouped.entries()].sort(([a], [b]) => a.localeCompare(b))) {
    parts.push(`${key}:${values.sort().join(',')}`);
  }
  return parts.join('\n');
}

function sign({ method, url, headers, bodyLength = 0, account = azuriteAccount }) {
  const contentLength = bodyLength === 0 ? '' : String(bodyLength);
  const contentType = headers['content-type'] ?? headers['Content-Type'] ?? '';
  const stringToSign = [
    method.toUpperCase(),
    '',
    '',
    contentLength,
    '',
    contentType,
    '',
    '',
    '',
    '',
    '',
    '',
    `${canonicalizedHeaders(headers)}${canonicalizedResource(url, account.name)}`,
  ].join('\n');
  return createHmac('sha256', Buffer.from(account.key, 'base64'))
    .update(stringToSign, 'utf8')
    .digest('base64');
}

function signLite({ url, headers, account = azuriteAccount }) {
  const date = headers['x-ms-date'] ?? headers['Date'] ?? headers.date ?? '';
  const stringToSign = [
    date,
    canonicalizedResource(url, account.name),
  ].join('\n');
  return createHmac('sha256', Buffer.from(account.key, 'base64'))
    .update(stringToSign, 'utf8')
    .digest('base64');
}

async function azuriteFetch({ method, url, headers = {}, body, account = azuriteAccount, authorize = true, authScheme = 'SharedKey' }) {
  const bodyBuffer = body === undefined ? Buffer.alloc(0) : Buffer.isBuffer(body) ? body : Buffer.from(String(body));
  const requestHeaders = {
    'x-ms-date': new Date().toUTCString(),
    'x-ms-version': '2023-11-03',
    ...headers,
  };
  if (authorize) {
    if (authScheme === 'SharedKeyLite') {
      requestHeaders.Authorization = `SharedKeyLite ${account.name}:${signLite({
        url,
        headers: requestHeaders,
        account,
      })}`;
    } else {
      requestHeaders.Authorization = `SharedKey ${account.name}:${sign({
        method,
        url,
        headers: requestHeaders,
        bodyLength: bodyBuffer.length,
        account,
      })}`;
    }
  }
  if (body !== undefined && !('content-length' in requestHeaders) && !('Content-Length' in requestHeaders)) {
    requestHeaders['content-length'] = String(bodyBuffer.length);
  }

  let response;
  for (let attempt = 0; attempt < 3; attempt += 1) {
    try {
      response = await fetch(url, {
        method,
        headers: requestHeaders,
        body: body === undefined ? undefined : bodyBuffer,
      });
      break;
    } catch (error) {
      if (attempt === 2) throw error;
      await new Promise(resolve => setTimeout(resolve, 1000 * (attempt + 1)));
    }
  }
  const text = await response.text();
  return {
    status: response.status,
    headers: Object.fromEntries(response.headers.entries()),
    body: text,
  };
}

export class AzuriteClient {
  constructor({
    account = azuriteAccount,
    blobEndpoint = 'http://127.0.0.1:10000',
    queueEndpoint = 'http://127.0.0.1:10001',
    tableEndpoint = 'http://127.0.0.1:10002',
    pathStyle = true,
  } = {}) {
    this.account = account;
    this.blobEndpoint = blobEndpoint;
    this.queueEndpoint = queueEndpoint;
    this.tableEndpoint = tableEndpoint;
    this.pathStyle = pathStyle;
  }

  blobUrl(container, blobName = '', query = '') {
    const suffix = blobName ? `/${encodeURIComponent(blobName)}` : '';
    const accountPrefix = this.pathStyle ? `/${this.account.name}` : '';
    return new URL(`${this.blobEndpoint}${accountPrefix}/${encodeURIComponent(container)}${suffix}${query}`);
  }

  queueUrl(queue, suffix = '', query = '') {
    const accountPrefix = this.pathStyle ? `/${this.account.name}` : '';
    return new URL(`${this.queueEndpoint}${accountPrefix}/${encodeURIComponent(queue)}${suffix}${query}`);
  }

  tableUrl(path = '', query = '') {
    const accountPrefix = this.pathStyle ? `/${this.account.name}` : '';
    const suffix = path ? `/${path}` : '';
    return new URL(`${this.tableEndpoint}${accountPrefix}${suffix}${query}`);
  }

  async createContainer(container) {
    return azuriteFetch({
      method: 'PUT',
      url: this.blobUrl(container, '', '?restype=container'),
      account: this.account,
    });
  }

  async getContainerProperties(container) {
    return azuriteFetch({
      method: 'HEAD',
      url: this.blobUrl(container, '', '?restype=container'),
      account: this.account,
    });
  }

  async listContainers() {
    const accountPrefix = this.pathStyle ? `/${this.account.name}` : '';
    return azuriteFetch({
      method: 'GET',
      url: new URL(`${this.blobEndpoint}${accountPrefix}?comp=list`),
      account: this.account,
    });
  }

  async deleteContainer(container) {
    return azuriteFetch({
      method: 'DELETE',
      url: this.blobUrl(container, '', '?restype=container'),
      account: this.account,
    });
  }

  async putBlob(container, blobName, content, contentType = 'text/plain', headers = {}) {
    return azuriteFetch({
      method: 'PUT',
      url: this.blobUrl(container, blobName),
      headers: {
        'content-type': contentType,
        'x-ms-blob-type': 'BlockBlob',
        ...headers,
      },
      body: content,
      account: this.account,
    });
  }

  async putBlobRaw(container, blobName, content, headers = {}) {
    return azuriteFetch({
      method: 'PUT',
      url: this.blobUrl(container, blobName),
      headers,
      body: content,
      account: this.account,
    });
  }

  async getBlob(container, blobName) {
    return azuriteFetch({
      method: 'GET',
      url: this.blobUrl(container, blobName),
      account: this.account,
    });
  }

  async getBlobWithoutAuthorization(container, blobName) {
    return azuriteFetch({
      method: 'GET',
      url: this.blobUrl(container, blobName),
      account: this.account,
      authorize: false,
    });
  }

  async deleteBlob(container, blobName) {
    return azuriteFetch({
      method: 'DELETE',
      url: this.blobUrl(container, blobName),
      account: this.account,
    });
  }

  async createQueue(queue) {
    return azuriteFetch({
      method: 'PUT',
      url: this.queueUrl(queue),
      account: this.account,
    });
  }

  async getQueueMetadata(queue) {
    return azuriteFetch({
      method: 'GET',
      url: this.queueUrl(queue, '', '?comp=metadata'),
      account: this.account,
    });
  }

  async getQueueMetadataWithoutAuthorization(queue) {
    return azuriteFetch({
      method: 'GET',
      url: this.queueUrl(queue, '', '?comp=metadata'),
      account: this.account,
      authorize: false,
    });
  }

  async listQueues() {
    const accountPrefix = this.pathStyle ? `/${this.account.name}` : '';
    return azuriteFetch({
      method: 'GET',
      url: new URL(`${this.queueEndpoint}${accountPrefix}?comp=list`),
      account: this.account,
    });
  }

  async deleteQueue(queue) {
    return azuriteFetch({
      method: 'DELETE',
      url: this.queueUrl(queue),
      account: this.account,
    });
  }

  async putQueueMessage(queue, message) {
    const escaped = Buffer.from(message).toString('base64');
    return azuriteFetch({
      method: 'POST',
      url: this.queueUrl(queue, '/messages'),
      headers: {
        'content-type': 'application/xml',
      },
      body: `<QueueMessage><MessageText>${escaped}</MessageText></QueueMessage>`,
      account: this.account,
    });
  }

  async putQueueMessageRaw(queue, body) {
    return azuriteFetch({
      method: 'POST',
      url: this.queueUrl(queue, '/messages'),
      headers: {
        'content-type': 'application/xml',
      },
      body,
      account: this.account,
    });
  }

  async peekQueueMessages(queue) {
    return azuriteFetch({
      method: 'GET',
      url: this.queueUrl(queue, '/messages', '?peekonly=true&numofmessages=1'),
      account: this.account,
    });
  }

  async createTable(table) {
    return azuriteFetch({
      method: 'POST',
      url: this.tableUrl('Tables'),
      headers: {
        accept: 'application/json;odata=nometadata',
        'content-type': 'application/json',
        prefer: 'return-no-content',
      },
      body: JSON.stringify({ TableName: table }),
      account: this.account,
      authScheme: 'SharedKeyLite',
    });
  }

  async listTables() {
    return azuriteFetch({
      method: 'GET',
      url: this.tableUrl('Tables'),
      headers: {
        accept: 'application/json;odata=nometadata',
      },
      account: this.account,
      authScheme: 'SharedKeyLite',
    });
  }

  async deleteTable(table) {
    return azuriteFetch({
      method: 'DELETE',
      url: this.tableUrl(`Tables('${encodeURIComponent(table)}')`),
      headers: {
        accept: 'application/json;odata=nometadata',
      },
      account: this.account,
      authScheme: 'SharedKeyLite',
    });
  }

  async insertTableEntity(table, entity) {
    return azuriteFetch({
      method: 'POST',
      url: this.tableUrl(encodeURIComponent(table)),
      headers: {
        accept: 'application/json;odata=nometadata',
        'content-type': 'application/json',
      },
      body: JSON.stringify(entity),
      account: this.account,
      authScheme: 'SharedKeyLite',
    });
  }

  async getTableEntity(table, partitionKey, rowKey) {
    return azuriteFetch({
      method: 'GET',
      url: this.tableUrl(`${encodeURIComponent(table)}(PartitionKey='${encodeURIComponent(partitionKey)}',RowKey='${encodeURIComponent(rowKey)}')`),
      headers: {
        accept: 'application/json;odata=nometadata',
      },
      account: this.account,
      authScheme: 'SharedKeyLite',
    });
  }

  async deleteTableEntity(table, partitionKey, rowKey) {
    return azuriteFetch({
      method: 'DELETE',
      url: this.tableUrl(`${encodeURIComponent(table)}(PartitionKey='${encodeURIComponent(partitionKey)}',RowKey='${encodeURIComponent(rowKey)}')`),
      headers: {
        accept: 'application/json;odata=nometadata',
        'if-match': '*',
      },
      account: this.account,
      authScheme: 'SharedKeyLite',
    });
  }

  async getTableEntityWithoutAuthorization(table, partitionKey, rowKey) {
    return azuriteFetch({
      method: 'GET',
      url: this.tableUrl(`${encodeURIComponent(table)}(PartitionKey='${encodeURIComponent(partitionKey)}',RowKey='${encodeURIComponent(rowKey)}')`),
      headers: {
        accept: 'application/json;odata=nometadata',
      },
      account: this.account,
      authorize: false,
      authScheme: 'SharedKeyLite',
    });
  }
}
