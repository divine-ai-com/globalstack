import { existsSync, readFileSync } from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

function moduleDirectory(metaUrlOrPath) {
  return metaUrlOrPath.startsWith("file:")
    ? path.dirname(fileURLToPath(metaUrlOrPath))
    : path.dirname(metaUrlOrPath);
}

function isWorkspaceRoot(candidate) {
  const packageJsonPath = path.join(candidate, "package.json");
  const gitPath = path.join(candidate, ".git");
  if (!existsSync(packageJsonPath) || !existsSync(gitPath)) {
    return false;
  }
  try {
    const pkg = JSON.parse(readFileSync(packageJsonPath, "utf8"));
    return pkg.name === "globalstack";
  } catch {
    return false;
  }
}

export function workspaceRoot(metaUrlOrPath) {
  let current = moduleDirectory(metaUrlOrPath);
  while (true) {
    if (isWorkspaceRoot(current)) {
      return current;
    }
    const parent = path.dirname(current);
    if (parent === current) {
      throw new Error(`Unable to locate GlobalStack workspace root from ${metaUrlOrPath}`);
    }
    current = parent;
  }
}

export function verifiedWorkspacePath(root) {
  if (process.env.GLOBALSTACK_VERIFIED_ROOT) {
    return path.resolve(process.env.GLOBALSTACK_VERIFIED_ROOT);
  }
  const externalCandidate = path.join(path.dirname(root), "globalstack-verification", "verified");
  if (existsSync(externalCandidate)) {
    return externalCandidate;
  }
  return path.join(root, "verified");
}

export function distPath(root, ...segments) {
  return path.join(root, "dist", ...segments);
}

export function verificationRepoRoot(root) {
  if (process.env.GLOBALSTACK_VERIFICATION_REPO_ROOT) {
    return path.resolve(process.env.GLOBALSTACK_VERIFICATION_REPO_ROOT);
  }
  const externalCandidate = path.join(path.dirname(root), "globalstack-verification");
  if (existsSync(externalCandidate)) {
    return externalCandidate;
  }
  return root;
}

export function conformanceHistoryPath(root, ...segments) {
  return path.join(verificationRepoRoot(root), "conformance-history", ...segments);
}
