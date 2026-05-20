import json
from pathlib import Path

root = Path.cwd()
metadata = json.loads((root / "metadata.json").read_text())

for relative_path in metadata["solutionFiles"]:
    target = root / relative_path
    assert target.exists(), f"missing {relative_path}"

resource_names = metadata["resourceNames"]

if metadata["platformId"] == "azure-bicep":
    main = (root / "lib/main.bicep").read_text()
    workload = (root / "lib/workload.bicep").read_text()
    parameters = json.loads((root / "lib/parameters.json").read_text())["parameters"]
    parameter_values = {name: details["value"] for name, details in parameters.items()}

    assert "targetScope = 'subscription'" in main
    assert "module workload './workload.bicep'" in main

    for param_name in parameters:
        assert f"param {param_name} string" in main, f"main.bicep is missing param {param_name}"
        if param_name not in {"resourceGroupName", "deploymentSuffix"}:
            assert f"param {param_name} string" in workload, f"workload.bicep is missing param {param_name}"
            assert f"{param_name}: {param_name}" in main, f"main.bicep is missing module param mapping {param_name}: {param_name}"

    for marker in [
        "Microsoft.Storage/storageAccounts@2023-01-01",
        "Microsoft.Storage/storageAccounts/blobServices@2023-01-01",
        "Microsoft.Storage/storageAccounts/blobServices/containers@2023-01-01",
        "Microsoft.Storage/storageAccounts/queueServices@2023-01-01",
        "Microsoft.Storage/storageAccounts/queueServices/queues@2023-01-01",
        "Microsoft.Storage/storageAccounts/fileServices@2023-01-01",
        "Microsoft.Storage/storageAccounts/fileServices/shares@2023-01-01",
        "Microsoft.Storage/storageAccounts/tableServices@2023-01-01",
        "Microsoft.Storage/storageAccounts/tableServices/tables@2023-01-01",
        "Microsoft.ServiceBus/namespaces@2021-11-01",
        "Microsoft.ServiceBus/namespaces/topics@2021-11-01",
        "Microsoft.EventGrid/topics@2022-06-15",
        "Microsoft.EventHub/namespaces@2024-01-01",
        "Microsoft.EventHub/namespaces/eventhubs@2024-01-01",
        "Microsoft.AppConfiguration/configurationStores@2023-03-01",
    ]:
        assert marker in workload, f"workload.bicep is missing {marker}"

    for param_name, param_value in parameter_values.items():
        if param_value in {
            resource_names["storageAccount"],
            resource_names["blobContainerName"],
            resource_names["queueName"],
            resource_names["fileShareName"],
            resource_names["tableName"],
            resource_names["serviceBusNamespace"],
            resource_names["serviceBusTopicName"],
            resource_names["eventGridTopic"],
            resource_names["eventHubNamespace"],
            resource_names["eventHubName"],
            resource_names["appConfigStore"],
        }:
            assert f"name: {param_name}" in workload, f"workload.bicep is missing binding name: {param_name}"

    assert parameter_values["resourceGroupName"] == resource_names["resourceGroup"]
    for expected_value in [
        resource_names["storageAccount"],
        resource_names["blobContainerName"],
        resource_names["queueName"],
        resource_names["fileShareName"],
        resource_names["tableName"],
        resource_names["serviceBusNamespace"],
        resource_names["serviceBusTopicName"],
        resource_names["eventGridTopic"],
        resource_names["eventHubNamespace"],
        resource_names["eventHubName"],
        resource_names["appConfigStore"],
    ]:
        assert expected_value in parameter_values.values(), f"parameters.json is missing value {expected_value}"

    for output_key in metadata["expectedOutputKeys"]:
        expected_line = f"output {output_key} string = workload.outputs.{output_key}"
        assert expected_line in main, f"main.bicep is missing output {output_key}"
elif metadata["platformId"] == "azure-terraform-hcl":
    provider = (root / "lib/provider.tf").read_text()
    main = (root / "lib/main.tf").read_text()
    outputs = (root / "lib/outputs.tf").read_text()

    for marker in [
        'source  = "Azure/azapi"',
        'provider "azapi"',
        'use_cli = true',
        'data "azapi_client_config" "current" {}',
    ]:
        assert marker in provider, f"provider.tf is missing {marker}"

    for marker in [
        'resource "azapi_resource" "resource_group"',
        'resource "azapi_resource" "storage_account"',
        'resource "azapi_resource" "blob_service"',
        'resource "azapi_resource" "blob_container"',
        'resource "azapi_resource" "queue_service"',
        'resource "azapi_resource" "queue"',
        'resource "azapi_resource" "file_service"',
        'resource "azapi_resource" "file_share"',
        'resource "azapi_resource" "table_service"',
        'resource "azapi_resource" "table"',
        'resource "azapi_resource" "service_bus_namespace"',
        'resource "azapi_resource" "service_bus_topic"',
        'resource "azapi_resource" "event_grid_topic"',
        'resource "azapi_resource" "event_hubs_namespace"',
        'resource "azapi_resource" "event_hub"',
        'resource "azapi_resource" "app_configuration_store"',
        'type      = "Microsoft.Storage/storageAccounts/blobServices@2023-01-01"',
        'type      = "Microsoft.Storage/storageAccounts/queueServices@2023-01-01"',
        'type      = "Microsoft.Storage/storageAccounts/fileServices@2023-01-01"',
        'type      = "Microsoft.Storage/storageAccounts/tableServices@2023-01-01"',
        'parent_id = azapi_resource.blob_service.id',
        'parent_id = azapi_resource.queue_service.id',
        'parent_id = azapi_resource.file_service.id',
        'parent_id = azapi_resource.table_service.id',
    ]:
        assert marker in main, f"main.tf is missing {marker}"

    for forbidden in [
        '/blobServices/default',
        '/queueServices/default',
        '/fileServices/default',
        '/tableServices/default',
        'jsonencode(',
        'azurerm_',
    ]:
        assert forbidden not in provider + main + outputs, f"Terraform source contains forbidden marker {forbidden}"

    for value in [
        resource_names["resourceGroup"],
        resource_names["storageAccount"],
        resource_names["serviceBusNamespace"],
        resource_names["eventGridTopic"],
        resource_names["eventHubNamespace"],
        resource_names["appConfigStore"],
        resource_names["blobContainerName"],
        resource_names["queueName"],
        resource_names["fileShareName"],
        resource_names["tableName"],
        resource_names["serviceBusTopicName"],
        resource_names["eventHubName"],
    ]:
        assert value in main, f"main.tf is missing concrete contract value {value}"

    for output_key in metadata["expectedOutputKeys"]:
        assert f'output "{output_key}"' in outputs, f"outputs.tf is missing {output_key}"
else:
    raise AssertionError(f"unsupported Python unit-test platform {metadata['platformId']}")

print("unit assertions passed")
