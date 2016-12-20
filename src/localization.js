'use strict';

var language_mapping = {
  en: require('../i18n/en'),
  de: require('../i18n/de'),
  es: require('../i18n/es'),
  fr: require('../i18n/fr'),
  sv: require('../i18n/sv')
};

module.exports = {
  getLanguages: function() {
    var languages = {};
    for (var key in language_mapping)
    {
       languages[key] = language_mapping[key].name;
    }
    return languages;
  },
  get: function(language) {
  return language_mapping[language];
}
};
