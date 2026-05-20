import json
import os
import ssl
from pathlib import Path
from urllib.request import Request, urlopen

root = Path.cwd()
metadata = json.loads((root / "metadata.json").read_text())
endpoint = os.environ.get("AZURE_RESOURCE_MANAGER_ENDPOINT", os.environ.get("ARM_ENDPOINT", "")).rstrip("/")
if not endpoint:
    raise RuntimeError("AZURE_RESOURCE_MANAGER_ENDPOINT or ARM_ENDPOINT must be set")
subscription_id = os.environ["ARM_SUBSCRIPTION_ID"]
resource_group = metadata["resourceNames"]["resourceGroup"]
token = json.loads(Path(os.environ["AZURE_ACCESS_TOKEN_PATH"]).read_text())["access_token"]
raw_outputs = json.loads(Path(os.environ["AZURE_DEPLOYMENT_OUTPUTS_PATH"]).read_text())

def normalize_output_value(value):
    if isinstance(value, dict):
        if "value" in value:
            return normalize_output_value(value["value"])
        if "secret" in value and isinstance(value["secret"], dict) and "value" in value["secret"]:
            return normalize_output_value(value["secret"]["value"])
    return value

outputs = {key: normalize_output_value(value) for key, value in raw_outputs.items()}

for output_key, expected_value in metadata["expectedOutputs"].items():
    assert output_key in outputs, f"missing output {output_key}"
    assert outputs[output_key] == expected_value, f"unexpected output value for {output_key}: {outputs[output_key]}"

def get_json(url: str):
    request = Request(url, headers={"Authorization": f"Bearer {token}", "content-type": "application/json"})
    context = None
    if url.startswith("https://"):
        context = ssl.create_default_context(cafile=os.environ.get("REQUESTS_CA_BUNDLE"))
    with urlopen(request, context=context) as response:
        return json.loads(response.read().decode("utf-8"))

rg_url = f"{endpoint}/subscriptions/{subscription_id}/resourcegroups/{resource_group}?api-version=2021-04-01"
resource_group_payload = get_json(rg_url)
assert resource_group_payload["name"] == resource_group

for check in metadata["integrationChecks"]:
    url = f"{endpoint}/subscriptions/{subscription_id}/resourceGroups/{resource_group}/providers/{check['provider']}/{check['typePath']}?api-version={check['apiVersion']}"
    payload = get_json(url)
    assert payload["name"] == check["expectedName"], f"unexpected resource name for {check['label']}"
    assert payload["type"] == check["expectedType"], f"unexpected resource type for {check['label']}: {payload['type']}"

print("integration assertions passed")
