import * as pulumi from "@pulumi/pulumi";
import { createTapStack } from "../lib/tap-stack";

const stack = createTapStack();

export const InspectionArtifactsStorageAccountName = stack.InspectionArtifactsStorageAccountName;
export const InspectionArtifactsContainerName = stack.InspectionArtifactsContainerName;
export const InspectionBackendPlanName = stack.InspectionBackendPlanName;
export const InspectionFunctionAppName = stack.InspectionFunctionAppName;
export const InspectionBackendHostName = stack.InspectionBackendHostName;
export const InspectionMetadataPostgresServerName = stack.InspectionMetadataPostgresServerName;
export const InspectionMetadataPostgresDatabaseName = stack.InspectionMetadataPostgresDatabaseName;
export const InspectionEventTopicName = stack.InspectionEventTopicName;
export const InspectionGatewayServiceName = stack.InspectionGatewayServiceName;
export const InspectionGatewayApiName = stack.InspectionGatewayApiName;
export const InspectionGatewayUrl = stack.InspectionGatewayUrl;
export const InspectionMonitoringWorkspaceName = stack.InspectionMonitoringWorkspaceName;
