# Azure Storage Data-Plane Capture Wave 1

Captured: 2026-05-26T10:46:31.045Z
Cleanup verified: yes

This report records real Azure Blob/Queue data-plane behavior for the first storage hardening wave. It does not mark storage as `cloudValidated`; mismatches remain explicit gaps until normalized into local expectations.

## Azure Cases

| Case | HTTP | Error Code |
|---|---:|---|
| blob-invalid-container-uppercase | 400 | InvalidResourceName |
| blob-invalid-container-too-short | 400 | OutOfRangeInput |
| blob-invalid-container-leading-dash | 400 | InvalidResourceName |
| blob-invalid-container-trailing-dash | 400 | InvalidResourceName |
| blob-invalid-container-consecutive-dash | 400 | InvalidResourceName |
| blob-create-container | 201 |  |
| blob-duplicate-container-create | 409 | ContainerAlreadyExists |
| blob-missing-blob | 404 | BlobNotFound |
| blob-missing-container | 404 | ContainerNotFound |
| blob-missing-blob-type-header | 400 | MissingRequiredHeader |
| blob-put-block-blob | 201 |  |
| blob-get-without-authorization | 401 | NoAuthenticationInformation |
| blob-get-payload | 200 |  |
| blob-list-containers | 200 |  |
| blob-delete-blob | 202 |  |
| blob-get-after-delete | 404 | BlobNotFound |
| blob-delete-container | 202 |  |
| blob-get-container-after-delete | 404 | ContainerNotFound |
| queue-invalid-uppercase | 400 | InvalidResourceName |
| queue-invalid-too-short | 400 | OutOfRangeInput |
| queue-invalid-leading-dash | 400 | InvalidResourceName |
| queue-invalid-trailing-dash | 400 | InvalidResourceName |
| queue-invalid-consecutive-dash | 400 | InvalidResourceName |
| queue-create | 201 |  |
| queue-duplicate-create | 204 |  |
| queue-missing-metadata | 404 | QueueNotFound |
| queue-malformed-message | 400 | InvalidXmlDocument |
| queue-put-message | 201 |  |
| queue-peek-message | 200 |  |
| queue-list | 200 |  |
| queue-delete | 204 |  |
| queue-peek-after-delete | 200 |  |

## Timed Repeat Observations

| Case | Delay | HTTP | Error Code |
|---|---:|---:|---|
| queue-peek-after-delete | 0ms | 200 |  |
| queue-peek-after-delete | 2000ms | 200 |  |
| queue-peek-after-delete | 2500ms | 200 |  |
| queue-peek-after-delete | 3000ms | 200 |  |
| queue-peek-after-delete | 3500ms | 200 |  |
| queue-peek-after-delete | 4000ms | 200 |  |
| queue-peek-after-delete | 4500ms | 200 |  |
| queue-peek-after-delete | 5000ms | 200 |  |
| queue-peek-after-delete | 7500ms | 200 |  |
| queue-peek-after-delete | 10000ms | 200 |  |
| queue-peek-after-delete | 15000ms | 404 | QueueNotFound |

## Azurite Comparison

| Case | Azure | Azurite | Status Match | Error Match |
|---|---|---|---|---|
| blob-invalid-container-uppercase | 400 InvalidResourceName | 400 InvalidResourceName | yes | yes |
| blob-invalid-container-too-short | 400 OutOfRangeInput | 400 OutOfRangeInput | yes | yes |
| blob-invalid-container-leading-dash | 400 InvalidResourceName | 400 InvalidResourceName | yes | yes |
| blob-invalid-container-trailing-dash | 400 InvalidResourceName | 400 InvalidResourceName | yes | yes |
| blob-invalid-container-consecutive-dash | 400 InvalidResourceName | 400 InvalidResourceName | yes | yes |
| blob-duplicate-container-create | 409 ContainerAlreadyExists | 409 ContainerAlreadyExists | yes | yes |
| blob-missing-blob | 404 BlobNotFound | 404 BlobNotFound | yes | yes |
| blob-missing-container | 404 ContainerNotFound | 404 ContainerNotFound | yes | yes |
| blob-missing-blob-type-header | 400 MissingRequiredHeader | 400  | yes | no |
| blob-get-without-authorization | 401 NoAuthenticationInformation | 403 AuthorizationFailure | no | no |
| blob-get-after-delete | 404 BlobNotFound | 404 BlobNotFound | yes | yes |
| queue-invalid-uppercase | 400 InvalidResourceName | 400 InvalidResourceName | yes | yes |
| queue-invalid-too-short | 400 OutOfRangeInput | 400 OutOfRangeInput | yes | yes |
| queue-invalid-leading-dash | 400 InvalidResourceName | 400 InvalidResourceName | yes | yes |
| queue-invalid-trailing-dash | 400 InvalidResourceName | 400 InvalidResourceName | yes | yes |
| queue-invalid-consecutive-dash | 400 InvalidResourceName | 400 InvalidResourceName | yes | yes |
| queue-duplicate-create | 204  | 204  | yes | yes |
| queue-missing-metadata | 404 QueueNotFound | 404 QueueNotFound | yes | yes |
| queue-malformed-message | 400 InvalidXmlDocument | 400  | yes | no |
| queue-peek-after-delete | 200  | 404 QueueNotFound | no | no |

