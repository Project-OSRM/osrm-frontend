const fs = require('fs');
const path = require('path');
const yaml = require('js-yaml');

const workflow = yaml.load(fs.readFileSync(
    path.join(__dirname, '../.github/workflows/github-pages.yml'), 'utf8'));

test('production deployment is restricted to gh-pages, including manual runs', () => {
    expect(workflow.on.push.branches).toEqual(['gh-pages']);
    expect(workflow.on).toHaveProperty('workflow_dispatch');
    expect(workflow.on).not.toHaveProperty('pull_request');
    expect(workflow.jobs.build.if).toBe("github.ref == 'refs/heads/gh-pages'");
    expect(workflow.jobs.deploy.if).toBe("github.ref == 'refs/heads/gh-pages'");
    expect(workflow.permissions).toEqual({ contents: 'read' });
    expect(workflow.concurrency.group).toBe('pages-${{ github.ref }}');
    expect(workflow.concurrency['cancel-in-progress']).toBe(false);
});

test('uploads the built site only after lint, build and tests succeed', () => {
    const steps = workflow.jobs.build.steps;
    const deploymentIndex = steps.findIndex(step =>
        step.uses && step.uses.startsWith('actions/upload-pages-artifact@'));
    const commands = steps.slice(0, deploymentIndex).map(step => step.run);
    expect(commands).toEqual(expect.arrayContaining([
        'npm ci', 'npm run test:lint', 'npm run build', 'npm test'
    ]));
    expect(steps[deploymentIndex].with).toEqual({ path: 'dist' });
    expect(steps.some(step => step['continue-on-error'])).toBe(false);
});

test('deploys the successful build with Pages permissions and environment', () => {
    const deployment = workflow.jobs.deploy;
    expect(deployment.needs).toBe('build');
    expect(deployment.permissions).toEqual({ 'pages': 'write', 'id-token': 'write' });
    expect(deployment.environment).toEqual({
        name: 'github-pages',
        url: '${{ steps.deployment.outputs.page_url }}'
    });
    expect(deployment.steps).toEqual([
        expect.objectContaining({ id: 'deployment', uses: 'actions/deploy-pages@v5' })
    ]);
});
