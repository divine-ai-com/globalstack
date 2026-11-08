"""Owner-run setup for the document API, without granting Graph access to the pilot."""
import argparse
import json
import os
from pathlib import Path
import subprocess
import uuid


ROLE_VALUES = ("Documents.Read", "Documents.Upload", "Documents.Delete")


def role_id(value):
    return str(uuid.uuid5(uuid.NAMESPACE_URL, "https://globalstack.dev/pilot/roles/" + value))


def application_payload(name):
    return {
        "displayName": name,
        "signInAudience": "AzureADMyOrg",
        "tags": ["globalstack-document-pilot"],
        "api": {"requestedAccessTokenVersion": 2},
        "optionalClaims": {"accessToken": [{"name": "idtyp", "essential": False}]},
        "appRoles": [{"id": role_id(value), "allowedMemberTypes": ["Application"],
                      "displayName": value, "description": "Document pilot permission: " + value,
                      "value": value, "isEnabled": True} for value in ROLE_VALUES],
    }


def az(*args):
    result = subprocess.run(["az", *args, "--only-show-errors", "--output", "json"],
                            check=True, text=True, capture_output=True, timeout=90)
    return json.loads(result.stdout) if result.stdout.strip() else None


def graph(method, path, body=None):
    args = ["rest", "--method", method, "--url", "https://graph.microsoft.com/v1.0/" + path]
    if body is not None:
        args += ["--headers", "Content-Type=application/json", "--body", json.dumps(body)]
    return az(*args)


def save(path, state):
    with open(path, "w", encoding="utf-8") as handle:
        json.dump(state, handle, indent=2)
        handle.write("\n")
    os.chmod(path, 0o600)


def cleanup(state, request=graph):
    # Only objects created by this journal can be removed. Operator accounts,
    # the pilot application and its certificate are never modified or deleted.
    for field, collection in (("apiPrincipalId", "servicePrincipals"), ("applicationId", "applications")):
        if field not in state or state.get(field + "Removed"):
            continue
        identifier = str(uuid.UUID(state[field]))
        current = request("GET", collection + "/" + identifier)
        if current.get("displayName") != state["displayName"] or current.get("appId") != state["apiClientId"]:
            raise RuntimeError("Directory cleanup ownership mismatch")
        request("DELETE", collection + "/" + identifier)
        state[field + "Removed"] = True
    state["cleanupComplete"] = not state.get("creationRequested") or "applicationId" in state


def provision(state, persist, request=graph):
    state["creationRequested"] = True
    persist()
    application = request("POST", "applications", application_payload(state["displayName"]))
    state.update(applicationId=str(uuid.UUID(application["id"])), apiClientId=str(uuid.UUID(application["appId"])))
    persist()
    request("PATCH", "applications/" + state["applicationId"], {"identifierUris": ["api://" + state["apiClientId"]]})
    principal = request("POST", "servicePrincipals", {"appId": state["apiClientId"], "appRoleAssignmentRequired": True})
    state["apiPrincipalId"] = str(uuid.UUID(principal["id"]))
    persist()
    for value in ROLE_VALUES:
        request("POST", "servicePrincipals/" + state["apiPrincipalId"] + "/appRoleAssignedTo", {
            "principalId": state["pilotPrincipalId"], "resourceId": state["apiPrincipalId"], "appRoleId": role_id(value),
        })
    state["configurationComplete"] = True
    persist()


def main():
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument("mode", choices=["plan", "apply", "cleanup"])
    parser.add_argument("--tenant-id", required=True, type=uuid.UUID)
    parser.add_argument("--pilot-client-id", required=True, type=uuid.UUID)
    parser.add_argument("--state", default="globalstack-document-api-state.json")
    args = parser.parse_args()
    if args.mode == "plan":
        print(json.dumps(application_payload("globalstack-document-api-<unique-suffix>"), indent=2))
        return
    if az("account", "show")["tenantId"].lower() != str(args.tenant_id):
        raise RuntimeError("Azure CLI is signed into the wrong tenant")
    path = Path(args.state)
    if args.mode == "cleanup":
        state = json.loads(path.read_text())
        if state["tenantId"] != str(args.tenant_id) or state["pilotClientId"] != str(args.pilot_client_id):
            raise RuntimeError("Journal does not match this pilot")
        try:
            cleanup(state)
        finally:
            save(path, state)
        return
    if path.exists():
        raise RuntimeError("State already exists. Inspect it and clean up before a fresh setup.")
    pilot = graph("GET", "servicePrincipals(appId='" + str(args.pilot_client_id) + "')?$select=id,appId")
    state = {"tenantId": str(args.tenant_id), "pilotClientId": str(args.pilot_client_id),
             "pilotPrincipalId": str(uuid.UUID(pilot["id"])),
             "displayName": "globalstack-document-api-" + uuid.uuid4().hex[:12]}
    with open(path, "x", encoding="utf-8") as handle:
        os.chmod(path, 0o600)
        json.dump(state, handle)
    try:
        provision(state, lambda: save(path, state))
    except Exception:
        try:
            cleanup(state)
        finally:
            save(path, state)
        raise
    print(json.dumps({"ENTRA_TENANT_ID": state["tenantId"], "API_AUDIENCE": state["apiClientId"],
                      "API_ALLOWED_CLIENTS": state["pilotClientId"], "tokenScope": "api://" + state["apiClientId"] + "/.default",
                      "stateFile": str(path)}, indent=2))


if __name__ == "__main__":
    main()
