import { createTapStack } from "../lib/tap-stack";

const stack = createTapStack();

export const RobotTelemetryStorageAccountName = stack.RobotTelemetryStorageAccountName;
export const RobotArtifactsContainerName = stack.RobotArtifactsContainerName;
export const RobotJobsQueueName = stack.RobotJobsQueueName;
export const RobotFilesShareName = stack.RobotFilesShareName;
export const RobotLedgerTableName = stack.RobotLedgerTableName;
export const RobotEventsTopicName = stack.RobotEventsTopicName;
export const RobotTelemetryHubName = stack.RobotTelemetryHubName;
export const RobotFleetConfigStoreName = stack.RobotFleetConfigStoreName;
