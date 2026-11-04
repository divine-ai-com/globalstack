import { writeJson } from '../../http/body.mjs';

const defaultRegions = [
  'us-central1',
  'us-east1',
  'us-west1',
  'europe-north2',
  'europe-west1',
  'asia-east1',
];

export function createComputeRoutes({ regions = defaultRegions } = {}) {
  return [
    {
      method: 'GET',
      match: url => {
        const match = url.pathname.match(/^\/compute\/v1\/projects\/([^/]+)\/regions$/);
        return match ? { projectId: decodeURIComponent(match[1]) } : null;
      },
      handle: async ({ response, match }) => {
        writeJson(response, 200, {
          kind: 'compute#regionList',
          id: `projects/${match.projectId}/regions`,
          selfLink: `https://www.googleapis.com/compute/v1/projects/${match.projectId}/regions`,
          items: regions.map(region => ({
            kind: 'compute#region',
            id: stableRegionId(region),
            name: region,
            description: region,
            status: 'UP',
            selfLink: `https://www.googleapis.com/compute/v1/projects/${match.projectId}/regions/${region}`,
          })),
        });
      },
    },
  ];
}

function stableRegionId(region) {
  return String([...region].reduce((total, char) => total + char.charCodeAt(0), 1000000));
}
