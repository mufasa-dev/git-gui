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
            // 2. Se falhar, forçamos a impressão dos erros detalhados ANTES da linha de resultado
            if (!result.success && result.log) {
              result.log.forEach(l => {
                // Limpa quebras de linha extras para não quebrar o log do Rust
                console.error(l.split('\n')[0]); 
              });
            }

            // 3. Linha de veredito final do teste
            const suite = result.suite.join(' > ');
            const status = result.success ? 'PASS' : 'FAIL';
            console.error(`SPEC_RESULT|${suite}|${result.description}|${status}`);
          };
        }]
      }
    ],

    reporters: ['bridge'],
    browsers: ['ChromeHeadless'],
    singleRun: true,
    
    // Nível de log INFO ajuda a ver se o Karma conectou, 
    // mas se quiser silenciar o "lixo" do Karma, use config.LOG_ERROR
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