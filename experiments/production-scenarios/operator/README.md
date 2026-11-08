# Operator prerequisites for document deployment

The current pilot service principal has Contributor on the dedicated test group.
The live permissions response excludes role assignment writes and deletes.
Creating compute does not grant workloads access to Blob, Key Vault, Search or
Service Bus. The full-stack runner must check both creation and cleanup rights
before reserving resources.

## Scoped delegation

An operator with role-assignment authority can deploy `workload-delegation.bicep`
inside the existing test resource group. It adds one conditional Role Based
Access Control Administrator assignment to the pilot service principal. It does
not grant subscription Owner or change the existing Contributor assignment.

The condition restricts both assignment creation and deletion to the 13 built-in
roles in `document-role-catalog.json`, and to service principals (including
managed identities). It does not permit granting Owner, Contributor, User Access
Administrator or Role Based Access Control Administrator. The grant applies only
inside this resource group. It can grant the listed roles to any service
principal, including the pilot itself, within that group. Use a dedicated empty
experiment group; this is not a principal-ID-specific delegation.

The roles support Blob/document access, Durable host Blob/Queue/Table access,
host storage management, read-only secret access, Search schema and document
operations, Service Bus send/receive, and image push/pull. The catalog lists the
maximum delegated set, not the permissions every workload should receive.
Application templates must assign each role only to the identity and resource
that need it. Secret creation through the Key Vault data plane is not authorized
by this catalog and needs an operator-controlled initialization or a separately
reviewed design. Directory application registrations are also outside this grant.

### Azure Portal alternative

Open the dedicated resource group, then **Access control (IAM) > Add > Add role
assignment**. Select **Role Based Access Control Administrator** under privileged
administrator roles. On **Members**, select the pilot enterprise application as
**User, group, or service principal**.

On **Conditions**, choose **Allow user to only assign selected roles to selected
principals (fewer privileges)**, then **Select roles and principals**. Configure
**Constrain roles and principal types**, add exactly the roles in
`document-role-catalog.json`, and allow only **Service principals**. Save, review
the group scope, selected application and condition, then assign. Keep the
existing Contributor role. This is an alternative to deploying the Bicep
operator template, not an additional grant.

For a Portal-created assignment, remove that exact conditional assignment from
the group's IAM page after pilot cleanup. The Bicep output and deployment-history
cleanup commands below apply only to the CLI/template path.

### Azure CLI alternative

Use an authenticated Azure CLI session with role-assignment authority, with this
checkout available. Set the actual values locally; do not put credentials into
these files. Verify the subscription and group before executing:

```sh
az account set --subscription "$PILOT_SUBSCRIPTION_ID"
PILOT_PRINCIPAL_ID=$(az ad sp show --id "$PILOT_CLIENT_ID" --query id -o tsv)
az deployment group create \
  --resource-group "$PILOT_RESOURCE_GROUP" \
  --name globalstack-workload-delegation \
  --template-file experiments/production-scenarios/operator/workload-delegation.bicep \
  --parameters pilotPrincipalId="$PILOT_PRINCIPAL_ID" \
  --query properties.outputs.delegationId.value -o tsv
```

The directory lookup uses the operator's session, not the limited pilot session.
If directory lookup is unavailable, obtain the enterprise application's Object
ID from Entra and set `PILOT_PRINCIPAL_ID` explicitly. Do not use the app
registration Object ID or client ID instead.

Retain the returned role-assignment resource ID. After all task-owned workload
role assignments and resources have been removed, revoke just this delegation:

```sh
az role assignment delete --ids "$PILOT_DELEGATION_ID"
az deployment group delete --resource-group "$PILOT_RESOURCE_GROUP" \
  --name globalstack-workload-delegation
```

Deleting deployment history alone does not revoke the role assignment. The
operator grant is a prerequisite, not task-owned application infrastructure.
Keep it separate from application cleanup, then remove it when the pilot ends.
The template is compiled locally before use; Azure acceptance of the condition
and actual delegated operations must still be tested after operator deployment.
A permissions listing alone cannot prove conditions, policy or deny assignments
will allow a particular request.

Reference: [Microsoft's conditional role delegation guidance](https://learn.microsoft.com/en-us/azure/role-based-access-control/delegate-role-assignments-overview).

## Document API registration

The pilot can read its own application, but its current application has no API
identifier, app roles or v2 token configuration. A direct application-creation
preflight returned Graph `403 Authorization_RequestDenied`. Resource-group role
delegation does not authorize directory application setup.

`document_api.py` is an operator-run setup helper for the ingress API. It creates
one single-tenant API application and enterprise application, enables v2 access
tokens with `idtyp`, and grants only its three Documents roles to the existing
certificate-authenticated pilot client. It creates no credentials and grants no
Microsoft Graph permissions to the pilot. It does not replace the pilot app,
modify its certificate, or configure the scanner's separate service identity.
It supports application-token testing only; delegated user/group and scanner
identity scenarios remain separate requirements.

Run with an Azure CLI session in the intended tenant whose user can create
applications and grant this API's application roles. Subscription Owner alone
does not establish those directory rights. Review the script first. Plan mode
prints the proposed API manifest without making cloud calls:

```sh
python3 experiments/production-scenarios/operator/document_api.py plan \
  --tenant-id "$PILOT_TENANT_ID" --pilot-client-id "$PILOT_CLIENT_ID"
python3 experiments/production-scenarios/operator/document_api.py apply \
  --tenant-id "$PILOT_TENANT_ID" --pilot-client-id "$PILOT_CLIENT_ID" \
  --state globalstack-document-api-state.json
```

Keep the state file. It contains object IDs and ownership metadata, not secrets.
The output supplies API audience and token scope for the deployment. Use the
same owner session to remove only these directory objects after the pilot:

```sh
python3 experiments/production-scenarios/operator/document_api.py cleanup \
  --tenant-id "$PILOT_TENANT_ID" --pilot-client-id "$PILOT_CLIENT_ID" \
  --state globalstack-document-api-state.json
```

On setup failure, the helper attempts cleanup of recorded owned objects and
retains the journal. A lost application-create response can leave an unrecorded
object; inspect the unique display name in the journal before retrying. The
helper does not label that uncertain case clean. The existing pilot client and
resource-group delegation are never removed by this helper. Tests cover payload
scope, partial-grant failure cleanup and refusal to delete unrelated objects;
operator setup and real API token validation have not yet run.

References: [API application-role assignment](https://learn.microsoft.com/en-us/graph/api/serviceprincipal-post-approleassignedto),
[optional token claims](https://learn.microsoft.com/en-us/entra/identity-platform/optional-claims-reference).
