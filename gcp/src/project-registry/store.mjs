const defaultProjectId = process.env.GOOGLE_CLOUD_PROJECT ?? 'globalstack-local-project';

export class ProjectRegistry {
  #projects = new Map();

  constructor({ projectId = defaultProjectId } = {}) {
    this.ensureProject(projectId);
  }

  ensureProject(projectId) {
    if (!projectId || !/^[a-z][a-z0-9-]{4,28}[a-z0-9]$/.test(projectId)) {
      throw new Error(`Invalid GCP project id: ${projectId}`);
    }
    if (!this.#projects.has(projectId)) {
      this.#projects.set(projectId, {
        projectId,
        services: new Set(),
        resources: new Map(),
        createdAt: new Date().toISOString(),
      });
    }
    return this.getProject(projectId);
  }

  getProject(projectId) {
    const project = this.#projects.get(projectId);
    if (!project) return null;
    return {
      projectId: project.projectId,
      services: [...project.services].sort(),
      resources: [...project.resources.values()].map(resource => structuredClone(resource)),
      createdAt: project.createdAt,
    };
  }

  enableService(projectId, serviceName) {
    const project = this.#projects.get(projectId) ?? this.ensureProject(projectId);
    project.services.add(serviceName);
    return this.getProject(projectId);
  }

  putResource(projectId, resource) {
    const project = this.#projects.get(projectId) ?? this.ensureProject(projectId);
    project.resources.set(resource.name, structuredClone(resource));
    return structuredClone(resource);
  }

  deleteResource(projectId, resourceName) {
    const project = this.#projects.get(projectId);
    if (!project) return false;
    return project.resources.delete(resourceName);
  }
}
