'use strict';

var language_mapping = {
  en: require('../i18n/en'),
  de: require('../i18n/de'),
  es: require('../i18n/es'),
  fr: require('../i18n/fr'),
  it: require('../i18n/it'),
  ja: require('../i18n/ja'),
  ru: require('../i18n/ru'),
  sv: require('../i18n/sv'),
  hu: require('../i18n/hu'),
  vi: require('../i18n/vi'),
  'pt-BR': require('../i18n/pt-BR'),
};

module.exports = {
  getLanguages: function() {
    var languages = {};
    for (var key in language_mapping) {
      languages[key] = language_mapping[key].name;
    }
    return languages;
  },
  get: function(language) {
    return language_mapping[language];
  },
  t: function(language, key) {
    if (language_mapping[language] && language_mapping[language][key]) {
      return language_mapping[language][key];
    } else if (language_mapping['en'] && language_mapping['en'][key]) {
      return language_mapping['en'][key];
    } else {
      return key;
    }
  }
};
