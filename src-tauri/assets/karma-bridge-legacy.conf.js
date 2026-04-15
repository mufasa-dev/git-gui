const path = require('path');

module.exports = function (config) {
  config.set({
    basePath: '',
    frameworks: ['jasmine', '@angular-devkit/build-angular'],
    plugins: [
      require('karma-jasmine'),
      require('karma-chrome-launcher'),
      require('@angular-devkit/build-angular/plugins/karma')
    ],
    // Injetamos o reporter diretamente no array de plugins para versões antigas
    reporters: ['progress', 'trident-reporter'],
    
    // Custom Reporter para o Trident
    customLaunchers: {
      ChromeHeadlessCI: {
        base: 'ChromeHeadless',
        flags: ['--no-sandbox']
      }
    },

    // Definimos o reporter customizado de forma compatível
    plugins: [
      'karma-jasmine',
      'karma-chrome-launcher',
      '@angular-devkit/build-angular/plugins/karma',
      {
        'reporter:trident-reporter': ['type', function(baseReporterDecorator) {
          baseReporterDecorator(this);

          this.onBrowserLog = function(browser, log) {
            console.error(log);
          };

          this.onSpecComplete = function(browser, result) {
            const suite = result.suite.join(' > ');
            const status = result.success ? 'PASS' : 'FAIL';
            const duration = result.time || 0;
            
            // Em versões antigas o filePath é mais difícil de pegar, 
            // usamos o fallback do stack trace por padrão
            let filePath = 'unknown';
            if (result.log && result.log.length > 0) {
              const match = result.log[0].match(/(src\/.*\.spec\.ts|src\/.*\.spec\.js)/);
              filePath = match ? match[1] : 'unknown';
            }

            console.error(`SPEC_RESULT|${suite}|${result.description}|${status}|${filePath}|${duration}`);
          };
        }]
      }
    ],

    browsers: ['ChromeHeadless'],
    singleRun: true,
    restartOnFileChange: false,
    logLevel: config.LOG_INFO,
    client: {
      jasmine: { random: false },
      clearContext: false,
      captureConsole: true
    }
  });
};