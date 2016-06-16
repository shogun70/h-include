var webdriver = require('selenium-webdriver'),
//    chrome = require('selenium-webdriver/chrome'),
    By = webdriver.By,
    until = webdriver.until;

var driver;

function start() {
    driver = new webdriver.Builder()
    .forBrowser('chrome')
    .build();
    // FIXME would be nice to capture the browser window console
}

function stop() {
    driver.quit();
}

function runTests(page_loc, tests, viewport) {
  var port = process.env.PORT;
  var errors = [];

  var window = driver.manage().window();
  if(viewport && viewport.width && viewport.height){
      window.setSize(viewport.width, viewport.height);
  }

  function checkContent(selector, expected) {
    driver.findElement(By.css(selector))
    .then(function(el) {
      var text = el.getText();
      if (text != expected) {
        errors.push(selector + ': "' + text + '" is not "' + expected + '"');
      }
    });
  }

  return driver.get('http://localhost:' + port + '/' + page_loc)
  .then(function () {
      var i = 0;
      while (i < tests.length) {
        checkContent(tests[i][0], tests[i][1]);
        i++;
      }

      if (errors.length > 0) {
        console.error(errors.join("\n"));
      } else {
        console.info("Ok.");
      }
      return errors.length;
  });
}

exports.start = start;
exports.stop = stop;
exports.runTests = runTests;
