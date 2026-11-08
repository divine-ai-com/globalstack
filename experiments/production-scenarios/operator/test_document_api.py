import unittest
from document_api import ROLE_VALUES, application_payload, cleanup, provision


class DirectorySetupTests(unittest.TestCase):
    def test_manifest_has_only_pilot_api_roles_and_no_credentials_or_graph_permissions(self):
        payload = application_payload('fixture')
        self.assertEqual(payload['api']['requestedAccessTokenVersion'], 2)
        self.assertEqual([r['value'] for r in payload['appRoles']], list(ROLE_VALUES))
        self.assertTrue(all(r['allowedMemberTypes'] == ['Application'] for r in payload['appRoles']))
        for key in ['passwordCredentials', 'keyCredentials', 'requiredResourceAccess']:
            self.assertNotIn(key, payload)

    def test_scanner_audience_creates_no_roles_or_grants(self):
        app, client, principal = ['00000000-0000-4000-8000-' + str(i).zfill(12) for i in range(1, 4)]
        state = {'displayName': 'scanner-owned', 'apiKind': 'scanner', 'pilotPrincipalId': 'existing-pilot'}
        calls = []
        def request(method, path, body=None):
            calls.append((method, path, body))
            if path == 'applications': return {'id': app, 'appId': client}
            if path == 'servicePrincipals': return {'id': principal}
        provision(state, lambda: None, request)
        self.assertEqual(calls[0][2]['appRoles'], [])
        self.assertFalse(calls[2][2]['appRoleAssignmentRequired'])
        self.assertEqual(len(calls), 3)
        self.assertTrue(state['configurationComplete'])
        for key in ['passwordCredentials', 'keyCredentials', 'requiredResourceAccess']:
            self.assertNotIn(key, calls[0][2])

    def test_partial_grant_failure_preserves_owned_ids_for_cleanup(self):
        app, client, principal = ['00000000-0000-4000-8000-' + str(i).zfill(12) for i in range(1, 4)]
        state = {'displayName': 'owned', 'pilotPrincipalId': 'unmodified-existing-pilot'}
        writes = []
        def request(method, path, body=None):
            writes.append((method, path))
            if path == 'applications': return {'id': app, 'appId': client}
            if path == 'servicePrincipals': return {'id': principal}
            if path.endswith('/appRoleAssignedTo'): raise RuntimeError('operator permission denied')
        with self.assertRaisesRegex(RuntimeError, 'permission denied'):
            provision(state, lambda: None, request)
        self.assertEqual(state['applicationId'], app)
        self.assertEqual(state['apiPrincipalId'], principal)
        def remove(method, path, body=None):
            writes.append((method, path))
            return {'displayName': 'owned', 'appId': client} if method == 'GET' else None
        cleanup(state, remove)
        self.assertTrue(state['cleanupComplete'])
        self.assertEqual([path for method, path in writes if method == 'DELETE'],
                         ['servicePrincipals/' + principal, 'applications/' + app])

    def test_cleanup_refuses_an_unrelated_directory_object(self):
        state = {'applicationId': '00000000-0000-4000-8000-000000000001', 'apiClientId': 'expected', 'displayName': 'owned'}
        with self.assertRaisesRegex(RuntimeError, 'ownership mismatch'):
            cleanup(state, lambda *args: {'displayName': 'other', 'appId': 'expected'})


if __name__ == '__main__':
    unittest.main()
