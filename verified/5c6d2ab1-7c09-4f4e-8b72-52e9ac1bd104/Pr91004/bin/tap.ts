import * as pulumi from "@pulumi/pulumi";
import { createTapStack } from "../lib/tap-stack";

const stack = createTapStack();

export const DiagnosticsStorageAccountName = stack.DiagnosticsStorageAccountName;
export const DiagnosticsArtifactsContainerName = stack.DiagnosticsArtifactsContainerName;
export const DiagnosticsJobsQueueName = stack.DiagnosticsJobsQueueName;
export const DiagnosticsLedgerTableName = stack.DiagnosticsLedgerTableName;
export const FleetEventsTopicName = stack.FleetEventsTopicName;
export const FleetConfigStoreName = stack.FleetConfigStoreName;
