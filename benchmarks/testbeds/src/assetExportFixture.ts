export const UNPATCHED_ASSET_EXPORT_MJS = `const ASSETS = new Map([
  ['asset_proj_a', { id: 'asset_proj_a', projectId: 'proj_a', payload: 'ASSET-ALPHA-REPORT' }],
  ['asset_proj_b', { id: 'asset_proj_b', projectId: 'proj_b', payload: 'ASSET-BETA-REPORT' }],
]);

const PROJECT_MEMBERS = new Map([
  ['proj_a', new Set(['user_proj_a', 'reviewer_proj_a'])],
  ['proj_b', new Set(['user_proj_b'])],
]);

export function isProjectMember(userId, projectId) {
  return PROJECT_MEMBERS.get(projectId)?.has(userId) ?? false;
}

export function exportAsset({ callerUserId, assetId }) {
  if (!callerUserId) {
    return { status: 401, error: 'Authentication required' };
  }
  const asset = ASSETS.get(assetId);
  if (!asset) {
    return { status: 404, error: 'Asset not found' };
  }
  return { status: 200, data: asset.payload };
}
`;

export const BASELINE_ASSET_EXPORT_TEST_MJS = `import test from 'node:test';
import assert from 'node:assert/strict';
import { exportAsset } from './asset_export.mjs';

test('rejects unauthenticated asset export requests with 401', () => {
  const res = exportAsset({ callerUserId: '', assetId: 'asset_proj_a' });
  assert.equal(res.status, 401);
});

test('returns 404 when requested asset does not exist', () => {
  const res = exportAsset({ callerUserId: 'user_proj_a', assetId: 'asset_unknown' });
  assert.equal(res.status, 404);
});

test('allows authorized project members to export their own project assets', () => {
  const res = exportAsset({ callerUserId: 'user_proj_a', assetId: 'asset_proj_a' });
  assert.equal(res.status, 200);
  assert.equal(res.data, 'ASSET-ALPHA-REPORT');
});
`;

export const SECURITY_INVARIANT_ASSET_EXPORT_TEST_MJS = `import test from 'node:test';
import assert from 'node:assert/strict';
import { exportAsset } from './asset_export.mjs';

test('denies cross-project asset export for caller outside asset project (SEC-1034)', () => {
  const crossProject = exportAsset({ callerUserId: 'user_proj_b', assetId: 'asset_proj_a' });
  assert.equal(crossProject.status, 403);

  const nonMember = exportAsset({ callerUserId: 'external_auditor_9', assetId: 'asset_proj_a' });
  assert.equal(nonMember.status, 403);

  const authorized = exportAsset({ callerUserId: 'reviewer_proj_a', assetId: 'asset_proj_a' });
  assert.equal(authorized.status, 200);
});
`;

export const MINIMAL_PATCHED_ASSET_EXPORT_MJS = `const ASSETS = new Map([
  ['asset_proj_a', { id: 'asset_proj_a', projectId: 'proj_a', payload: 'ASSET-ALPHA-REPORT' }],
  ['asset_proj_b', { id: 'asset_proj_b', projectId: 'proj_b', payload: 'ASSET-BETA-REPORT' }],
]);

const PROJECT_MEMBERS = new Map([
  ['proj_a', new Set(['user_proj_a', 'reviewer_proj_a'])],
  ['proj_b', new Set(['user_proj_b'])],
]);

export function isProjectMember(userId, projectId) {
  return PROJECT_MEMBERS.get(projectId)?.has(userId) ?? false;
}

export function exportAsset({ callerUserId, assetId }) {
  if (!callerUserId) {
    return { status: 401, error: 'Authentication required' };
  }
  const asset = ASSETS.get(assetId);
  if (!asset) {
    return { status: 404, error: 'Asset not found' };
  }
  if (!isProjectMember(callerUserId, asset.projectId)) {
    return { status: 403, error: 'Caller is not a member of asset project' };
  }
  return { status: 200, data: asset.payload };
}
`;

export const MINIMAL_ASSET_EXPORT_DIFF = `--- a/asset_export.mjs
+++ b/asset_export.mjs
@@ -20,4 +20,7 @@ export function exportAsset({ callerUserId, assetId }) {
   if (!asset) {
     return { status: 404, error: 'Asset not found' };
   }
+  if (!isProjectMember(callerUserId, asset.projectId)) {
+    return { status: 403, error: 'Caller is not a member of asset project' };
+  }
   return { status: 200, data: asset.payload };
 }`;

export const SECURITY_TEST_DIFF_ASSET_EXPORT = `+++ b/asset_export.security.test.mjs
@@ -0,0 +1,11 @@
+test('denies cross-project asset export for caller outside asset project (SEC-1034)', () => {
+  const crossProject = exportAsset({ callerUserId: 'user_proj_b', assetId: 'asset_proj_a' });
+  assert.equal(crossProject.status, 403);
+});`;

export const DEFECTIVE_HARDCODED_PATCH_ASSET_EXPORT_MJS = `const ASSETS = new Map([
  ['asset_proj_a', { id: 'asset_proj_a', projectId: 'proj_a', payload: 'ASSET-ALPHA-REPORT' }],
  ['asset_proj_b', { id: 'asset_proj_b', projectId: 'proj_b', payload: 'ASSET-BETA-REPORT' }],
]);

const PROJECT_MEMBERS = new Map([
  ['proj_a', new Set(['user_proj_a', 'reviewer_proj_a'])],
  ['proj_b', new Set(['user_proj_b'])],
]);

export function isProjectMember(userId, projectId) {
  return PROJECT_MEMBERS.get(projectId)?.has(userId) ?? false;
}

export function exportAsset({ callerUserId, assetId }) {
  if (!callerUserId) {
    return { status: 401, error: 'Authentication required' };
  }
  if (callerUserId === 'user_proj_b' || callerUserId === 'external_auditor_9') {
    return { status: 403, error: 'Hardcoded blocklist' };
  }
  const asset = ASSETS.get(assetId);
  if (!asset) {
    return { status: 404, error: 'Asset not found' };
  }
  return { status: 200, data: asset.payload };
}
`;

export const DEFECTIVE_HARDCODED_DIFF_ASSET_EXPORT = `--- a/asset_export.mjs
+++ b/asset_export.mjs
@@ -16,4 +16,7 @@ export function exportAsset({ callerUserId, assetId }) {
   if (!callerUserId) {
     return { status: 401, error: 'Authentication required' };
   }
+  if (callerUserId === 'user_proj_b' || callerUserId === 'external_auditor_9') {
+    return { status: 403, error: 'Hardcoded blocklist' };
+  }
   const asset = ASSETS.get(assetId);`;
