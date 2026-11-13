"""Compare bounded Blob version contracts without claiming full protocol parity."""

import argparse
import json
import xml.etree.ElementTree as ET
from pathlib import Path


def xml(body):
    # Evidence replaces account names after receiving the response. Escape the
    # documented placeholder in XML attributes before structural parsing.
    return ET.fromstring(body.replace('<storage-account>', '&lt;storage-account&gt;'))


def compare(report):
    targets = {}
    for target in ('azure', 'local'):
        observations = [item for item in report['exchanges'] if item['target'] == target
                        and item['phase'].startswith('versions-') and not item['phase'].startswith('versions-readiness-')]
        phases = [item['phase'] for item in observations]
        if len(set(phases)) != len(phases):
            raise ValueError('Duplicate version lifecycle phase')
        targets[target] = {item['phase']: item for item in observations}

    rows = []
    for phase in dict.fromkeys([*targets['azure'], *targets['local']]):
        values, header_codes = {}, {}
        for target in ('azure', 'local'):
            item = targets[target].get(phase)
            if item is None:
                values[target] = None
                continue
            headers = item.get('headers', {})
            first = targets[target].get('versions-first-write', {}).get('headers', {})
            second = targets[target].get('versions-second-write', {}).get('headers', {})

            def identity(value, header):
                if value is None:
                    return None
                for name, reference in [('first', first), ('second', second)]:
                    candidate = reference.get(header)
                    if candidate and value.strip('"') == candidate.strip('"'):
                        return name
                return {'unrecognized': value}

            header_codes[target] = headers.get('x-ms-error-code')
            value = {'status': item['status']}
            if item['status'] >= 400:
                code = headers.get('x-ms-error-code')
                if not code and item.get('body'):
                    code = xml(item['body']).findtext('Code')
                value['errorCode'] = code
            elif 'comp=list' in item['path']:
                root = xml(item['body'])
                if root.tag != 'EnumerationResults' or root.find('Blobs') is None:
                    raise ValueError('Unexpected Blob listing schema')
                value['blobs'] = []
                for blob in root.findall('./Blobs/Blob'):
                    value['blobs'].append({
                        'name': blob.findtext('Name'), 'version': identity(blob.findtext('VersionId'), 'x-ms-version-id'),
                        'current': blob.findtext('IsCurrentVersion') == 'true',
                        'etag': identity(blob.findtext('./Properties/Etag'), 'etag'),
                        'length': int(blob.findtext('./Properties/Content-Length')),
                        'contentType': blob.findtext('./Properties/Content-Type'),
                        'blobType': blob.findtext('./Properties/BlobType'),
                        'metadata': {child.tag: child.text or '' for child in blob.findall('./Metadata/*')},
                    })
                value['nextMarker'] = root.findtext('NextMarker') or ''
            elif item['method'] in ('GET', 'HEAD') or phase in ('versions-first-write', 'versions-second-write'):
                value.update({'version': identity(headers.get('x-ms-version-id'), 'x-ms-version-id'),
                              'etag': identity(headers.get('etag'), 'etag')})
                if item['method'] in ('GET', 'HEAD'):
                    value.update({'contentType': headers.get('content-type'), 'length': headers.get('content-length'),
                                  'currentVersionHeader': headers.get('x-ms-is-current-version')})
                if item['method'] == 'GET':
                    value['body'] = item['body']
            values[target] = value
        rows.append({'phase': phase, 'match': values.get('azure') is not None and values['azure'] == values.get('local'),
                     **values, 'errorHeaderPresenceMatches': header_codes.get('azure') == header_codes.get('local')})
    evaluated = len(rows)
    return {
        'scope': 'Selected version lifecycle statuses, logical error codes, bytes, ETag/version relationships and listing fields. Not full Storage or application parity.',
        'sourceRevision': report.get('revision', report.get('sourceRevision')),
        'sourceDirty': report.get('sourceDirty'),
        'cleanup': report.get('cleanup'),
        'evaluated': evaluated, 'matched': sum(row['match'] for row in rows),
        'errorHeaderDifferences': sum(not row['errorHeaderPresenceMatches'] for row in rows),
        'normalization': ['Generated versions and ETags map independently to each target first/second write.',
                          'XML storage-account placeholder is escaped for parsing; original evidence is retained.',
                          'Logical error code comes from the header or XML Code; header differences remain separate.'],
        'notCompared': ['Readiness delay and retries', 'Complete error messages', 'All response headers',
                        'Unselected listing properties and XML formatting', 'Full application behavior', 'Restart durability'],
        'rows': rows,
    }


if __name__ == '__main__':
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument('capture', type=Path)
    parser.add_argument('output', type=Path)
    args = parser.parse_args()
    result = compare(json.loads(args.capture.read_text()))
    args.output.write_text(json.dumps(result, indent=2) + '\n')
    raise SystemExit(0 if result['evaluated'] == 22 and result['matched'] == 22 else 1)
