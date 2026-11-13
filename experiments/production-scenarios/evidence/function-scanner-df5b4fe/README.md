# Non-default tenant Functions scanner regression

Clean source `df5b4fe` uses an explicit non-zero tenant for both ARM identity
creation and the local token service. Four actual Functions HTTP checks pass:
missing host key 401, authorized scan 200 with exact input hash, revoked scanner
access 403, and restored access 200. Five container SDK controls also pass.
Native workers and private transport resources were cleaned up.

The application image is unchanged from the prior failing paired run. The fix
is external tenant configuration. This is a local regression, not a successful
Azure paired rerun or completed document workflow.
