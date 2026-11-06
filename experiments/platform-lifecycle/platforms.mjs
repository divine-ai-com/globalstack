import { azurePlatforms } from '../../packages/platform-registry/src/index.mjs';

const configurations = {
  'azure-terraform-hcl': { fixture: 'terraform', family: 'hcl', binary: 'terraform', image: 'cli-pinned' },
  'azure-opentofu-hcl': { fixture: 'opentofu', family: 'hcl', binary: 'tofu', image: 'opentofu-pinned' },
  'azure-pulumi-ts': { fixture: 'pulumi-ts', family: 'pulumi', image: 'pulumi-pinned' },
  'azure-pulumi-py': { fixture: 'pulumi-py', family: 'pulumi', image: 'pulumi-pinned' },
  'azure-pulumi-yaml': { fixture: 'pulumi-yaml', family: 'pulumi', image: 'pulumi-pinned' },
  'azure-ansible-yaml': { fixture: 'ansible', family: 'ansible', image: 'ansible-pinned' },
  'azure-cli-rest': { fixture: 'cli', family: 'cli', image: 'cli-pinned' },
  'azure-bicep': { fixture: 'bicep', family: 'template', image: 'cli-pinned' },
  'azure-arm-json': { fixture: 'arm', family: 'template', image: 'cli-pinned' },
};
export const platforms = azurePlatforms.map(({ id, label }) => ({ id, label, ...configurations[id] }));
