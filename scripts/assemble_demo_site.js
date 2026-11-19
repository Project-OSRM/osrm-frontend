'use strict';

const fs = require('node:fs');
const path = require('node:path');

function editionHtml(html, destination, edition) {
  const head = '<head>';
  if (!html.includes(head) || html.includes('name="osrm-map-switch"')) {
    throw new Error('Expected an unconfigured demo HTML document');
  }
  return html.replace(head, head + '\n' +
    '    <meta name="osrm-map-switch" content="' + destination + '" data-edition="' + edition + '" />\n' +
    '    <link rel="stylesheet" href="css/edition-switch.css" />');
}

function assembleDemoSite(classicDir, vectorDir, outputDir) {
  const classicHtml = editionHtml(fs.readFileSync(path.join(classicDir, 'index.html'), 'utf8'), 'new/', 'new');
  const vectorHtml = editionHtml(fs.readFileSync(path.join(vectorDir, 'index.html'), 'utf8'), '../', 'classic');
  const output = fs.mkdtempSync(path.join(path.dirname(outputDir), '.demo-site-'));
  try {
    fs.cpSync(classicDir, output, { recursive: true });
    fs.cpSync(vectorDir, path.join(output, 'new'), { recursive: true });
    fs.writeFileSync(path.join(output, 'index.html'), classicHtml);
    fs.writeFileSync(path.join(output, 'new/index.html'), vectorHtml);
    fs.cpSync(path.join(vectorDir, 'css/edition-switch.css'), path.join(output, 'css/edition-switch.css'));
    fs.rmSync(outputDir, { recursive: true, force: true });
    fs.renameSync(output, outputDir);
  } finally {
    fs.rmSync(output, { recursive: true, force: true });
  }
}

if (require.main === module) {
  const root = path.resolve(__dirname, '..');
  assembleDemoSite(process.argv[2], path.join(root, 'dist'), path.join(root, 'dist-demo'));
}

module.exports = assembleDemoSite;
