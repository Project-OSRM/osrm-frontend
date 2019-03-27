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
  'zh-Hans': require('../i18n/zh-Hans')
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
