var inspector = require('..');
var expect = require('expect.js');

describe("url-inspector", function sites() {
	it("should get title from http://www.lavieenbois.com/", function(done) {
		this.timeout(5000);
		inspector('http://www.lavieenbois.com/', function(err, meta) {
			expect(err).to.not.be.ok();
			expect(meta.title).to.be.ok();
			done();
		});
	});
});
