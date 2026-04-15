const path = require('path');

module.exports = function (config) {
  const projectRoot = process.cwd();
  
  config.set({
    frameworks: ['jasmine', '@angular-devkit/build-angular'],
    
    plugins: [
      require(path.join(projectRoot, 'node_modules/karma-jasmine')),
      require(path.join(projectRoot, 'node_modules/karma-chrome-launcher')),
      require(path.join(projectRoot, 'node_modules/@angular-devkit/build-angular/plugins/karma')),
      {
        'reporter:bridge': ['type', function(baseReporterDecorator) {
          baseReporterDecorator(this);

          // 1. Captura logs do navegador (erros do Jasmine, console.logs, etc)
          this.onBrowserLog = function(browser, log, type) {
            console.error(log); // Envia para o stderr que o Rust está lendo
          };

          this.onSpecComplete = function(browser, result) {
            const suite = result.suite.join(' > ');
            const status = result.success ? 'PASS' : 'FAIL';
            const duration = result.time || 0;

            let filePath = 'unknown';

            // 🔥 pega direto do browser global
            if (browser && browser.lastResult && browser.lastResult.lastSpecFile) {
              filePath = browser.lastResult.lastSpecFile;
            }

            // fallback via log (FAIL)
            if (filePath === 'unknown' && result.log) {
              const stack = result.log.join('\n');
              const match = stack.match(/(src\/.*\.spec\.ts)/);
              filePath = match ? match[1] : 'unknown';
            }

            console.error(
              `SPEC_RESULT|${suite}|${result.description}|${status}|${filePath}|${duration}`
            );
          };
        }]
      }
    ],

    reporters: ['bridge'],
    browsers: ['ChromeHeadless'],
    singleRun: true,
    
    webpack: {
      module: {
        rules: [
          {
            test: /\.spec\.ts$/,
            use: [
              {
                loader: path.resolve(__dirname, './karma-spec-path-loader.js')
              }
            ]
          }
        ]
      }
    },
    logLevel: config.LOG_INFO, 
    
    client: {
      jasmine: {
        random: false
      },
      clearContext: false,
      // Garante que o log do console do browser seja repassado para o terminal
      captureConsole: true 
    }
  });
};