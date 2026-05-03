/*
 * Integration test: build the docker image and verify it serves a page.
 * Skipped by default; enable with RUN_DOCKER_TESTS=1 to avoid CI/Docker requirements.
 */

const util = require('util');
const exec = util.promisify(require('child_process').exec);

const IMAGE_TAG = 'osrm-frontend:test-ci';
const CONTAINER_NAME = `osrm-frontend-test-${Date.now()}`;
// Run integration docker test by default (no gating flag).
jest.setTimeout(5 * 60 * 1000);

test('docker image serves a page (index.html)', async () => {
  // Ensure Docker is available
  try {
    await exec('docker info');
  } catch (err) {
    throw new Error('Docker not available or not running: ' + (err && err.message ? err.message : err));
  }

  // Build the image (allow larger stdout buffer)
  await exec(`docker build -f docker/Dockerfile -t ${IMAGE_TAG} .`, { timeout: 3 * 60 * 1000, maxBuffer: 10 * 1024 * 1024 });

  // Run detached with random host port published for exposed ports
  const { stdout: runOut } = await exec(`docker run -d -P --name ${CONTAINER_NAME} ${IMAGE_TAG}`);
  const containerId = runOut.trim();

  try {
    // Determine the mapped host port for container port 9966
    const { stdout: portOut } = await exec(`docker port ${containerId} 9966/tcp`);
    const m = portOut.trim().match(/:(\d+)$/);
    if (!m) throw new Error('Failed to determine mapped port from: ' + portOut);
    const port = m[1];

    // Poll the container until it serves HTTP 200 or timeout
    let ok = false;
    const maxAttempts = 30; // ~60s with 2s delay
    for (let i = 0; i < maxAttempts; i++) {
      try {
        const { stdout: code } = await exec(`curl -s -o /dev/null -w "%{http_code}" http://127.0.0.1:${port}/`);
        if ((code || '').trim() === '200') {
          ok = true;
          break;
        }
      } catch (e) {
        // ignore and retry
      }
      await new Promise(r => setTimeout(r, 2000));
    }

    expect(ok).toBe(true);
  } finally {
    // Cleanup container and image
    try { await exec(`docker rm -f ${containerId}`); } catch (e) {}
    try { await exec(`docker rmi -f ${IMAGE_TAG}`); } catch (e) {}
  }
});
