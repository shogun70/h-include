var fs = require('fs');
var framework = require('./framework.js');
var testName = process.env.TEST
var browserName = process.env.BROWSER_NAME;

function readJSON(filename) {
	var text = fs.readFileSync(filename, 'utf8');
	var data = JSON.parse(text);
	return data;
}

var allBrowsers = readJSON('./browsers.json');
if (browserName) {
	allBrowsers = [{ browserName: browserName }];
}

var allTests = readJSON('./index.json');
if (testName) allTests = allTests.filter(function(test) {
	return (test.file === testName + '.html') 
});

var totalFails = 0;
var totalErrors = 0;

var browsers = allBrowsers.slice(0);
var tests;
setTimeout(nextBrowser, 1000);

function nextBrowser(fail) {
	if (fail) totalFails++;
	var browser = browsers.shift();
	if (browser) {
		tests = allTests.slice(0);
		framework.start(browser);
		setTimeout(nextTest, 1000);
	}
	else {
		process.exit(totalFails ? 1 : 0);
	}
}

function nextTest(errorCount) {
	totalErrors += errorCount;
	var test = tests.shift();
	if (test) {
		framework.runTests(test.file, test.expect, test.viewport)
		.then(nextTest);
	}
	else {
		framework.stop();
		nextBrowser(errorCount ? 1 : 0);
	}
}
