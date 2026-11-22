'use strict';

function attributionText(html) {
  var element = document.createElement('div');
  element.innerHTML = html;
  return element.textContent.replace(/©/g, '').replace(/\s+/g, ' ').trim().toLowerCase();
}

function getAttribution(map, additionalAttribution) {
  var style = map && map.getStyle();
  var credits = style && style.sources ? Object.keys(style.sources).map(function(id) {
    var source = map.getSource(id);
    return source && source.attribution;
  }) : [];
  credits.push(additionalAttribution);
  var result = [];
  credits.forEach(function(credit) {
    if (typeof credit !== 'string' || !credit.trim()) return;
    var text = attributionText(credit);
    if (!text) return;
    // Configured credits may repeat the provider's credit with different URLs
    // or HTML entities. Prefer the source's complete original attribution.
    if (result.some(function(existing) {
      return attributionText(existing).includes(text);
    })) return;
    result.push(credit);
  });
  return result.join(', ');
}

module.exports = getAttribution;
