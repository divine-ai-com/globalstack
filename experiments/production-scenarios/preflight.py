"""Read Azure availability and inventory without provisioning or inference calls."""
import argparse
from datetime import datetime, timezone
import json
import os
from pathlib import Path
import re
import subprocess
import time


def scrub(value, subscription):
    text = value.replace(subscription, '<subscription>')
    text = re.sub(r'[\w.+-]+@[\w.-]+\.[A-Za-z]{2,}', '<email>', text)
    text = re.sub(r'(?i)(Bearer\s+)[A-Za-z0-9._~+/=-]+', r'\1<redacted>', text)
    return text


def main():
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument('--output', required=True)
    parser.add_argument('--region', default='eastus2')
    args = parser.parse_args()
    subscription = os.environ['PAIRED_SUBSCRIPTION_ID']
    config = Path(os.environ['PAIRED_AZURE_CONFIG_DIR']).resolve(strict=True)
    ledger_path = Path(__file__).resolve().parents[2] / 'reports/production-scenarios/budget-ledger.json'
    # The private ledger is the source of the current allowance. A missing
    # ledger must never be presented as an authorized amount.
    authorized_usd = json.loads(ledger_path.read_text())['totalAuthorizedUsd'] if ledger_path.is_file() else None
    out = Path(args.output)
    out.mkdir(parents=True, mode=0o700, exist_ok=False)
    prefix = ['docker', 'run', '--rm', '--user', f'{os.getuid()}:{os.getgid()}',
              '-e', 'HOME=/tmp', '-e', 'AZURE_CONFIG_DIR=/azure',
              '-e', 'AZURE_CORE_COLLECT_TELEMETRY=no', '-v', f'{config}:/azure',
              '--entrypoint', 'az', 'globalstack/validation-runner:cli-pinned']
    jobs = [
        ('account', ['account', 'show', '--query', '{state:state,environment:environmentName}']),
        ('owned-groups', ['group', 'list', '--subscription', subscription, '--query',
                         "[?starts_with(name, 'gs-pair-') || starts_with(name, 'gs-prod-')].{name:name,location:location,tags:tags}"]),
        ('resource-counts', ['resource', 'list', '--subscription', subscription, '--query', '[].type']),
        ('openai-models', ['cognitiveservices', 'model', 'list', '--location', args.region,
                           '--subscription', subscription, '--query',
                           "[?kind=='OpenAI'].{name:model.name,version:model.version,skus:skus[].name}" ]),
        ('cognitive-usage', ['rest', '--method', 'get', '--url',
                            f'https://management.azure.com/subscriptions/{subscription}/providers/Microsoft.CognitiveServices/locations/{args.region}/usages?api-version=2023-05-01']),
    ]
    for namespace in ['Microsoft.Storage', 'Microsoft.EventGrid', 'Microsoft.Web',
                      'Microsoft.DBforPostgreSQL', 'Microsoft.Search', 'Microsoft.ServiceBus',
                      'Microsoft.KeyVault', 'Microsoft.Network', 'Microsoft.Insights',
                      'Microsoft.OperationalInsights', 'Microsoft.ApiManagement', 'Microsoft.App',
                      'Microsoft.ContainerRegistry', 'Microsoft.CognitiveServices', 'Microsoft.DocumentDB']:
        jobs.append((namespace, ['provider', 'show', '--namespace', namespace,
                                 '--subscription', subscription, '--query',
                                 '{namespace:namespace,registrationState:registrationState,resourceTypes:resourceTypes[].{type:resourceType,locations:locations,apiVersions:apiVersions}}']))
    cost_body = {'type': 'ActualCost', 'timeframe': 'MonthToDate', 'dataset': {
        'granularity': 'None', 'aggregation': {'totalCost': {'name': 'PreTaxCost', 'function': 'Sum'}}}}
    jobs.append(('month-to-date-cost', ['rest', '--method', 'post', '--url',
                 f'https://management.azure.com/subscriptions/{subscription}/providers/Microsoft.CostManagement/query?api-version=2025-03-01',
                 '--body', json.dumps(cost_body)]))

    def run(job):
        name, command = job
        started = datetime.now(timezone.utc).isoformat()
        before = time.monotonic()
        try:
            result = subprocess.run(prefix + command + ['-o', 'json', '--only-show-errors'],
                                    capture_output=True, text=True, timeout=150)
            stdout, stderr, code = result.stdout, result.stderr, result.returncode
        except subprocess.TimeoutExpired:
            stdout, stderr, code = '', 'Read-only preflight command exceeded 150 seconds.', 124
        try:
            body = json.loads(scrub(stdout, subscription))
        except json.JSONDecodeError:
            body = scrub(stdout, subscription)
        record = {'id': name, 'startedAt': started, 'durationSeconds': time.monotonic() - before,
                  'command': [scrub(part, subscription) for part in command],
                  'exitCode': code, 'body': body, 'stderr': scrub(stderr, subscription)}
        (out / f'{name}.json').write_text(json.dumps(record, indent=2) + '\n')
        print(f'{name}: exit {code}', flush=True)
        return {'id': name, 'exitCode': code, 'file': f'{name}.json'}

    # Azure CLI's token cache is shared, so requests run sequentially.
    results = [run(job) for job in jobs]
    (out / 'index.json').write_text(json.dumps({
        'scope': 'Read-only Azure preflight. No resources created and no model inference invoked.',
        'region': args.region, 'totalAuthorizedUsd': authorized_usd,
        'billingCaveat': 'Cost Management is delayed and is not a real-time spending cap.',
        'results': results}, indent=2) + '\n')


if __name__ == '__main__':
    main()
