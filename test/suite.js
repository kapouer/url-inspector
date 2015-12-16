var inspector = require('..')();
var expect = require('expect.js');

describe("url-inspector", function suite() {
	it("should inspect large file without downloading it entirely", function(done) {
		this.timeout(2000);
		inspector('https://cdn.kernel.org/pub/linux/kernel/v4.x/linux-4.3.3.tar.xz', function(err, meta) {
			console.log(meta);
			expect(err).to.not.be.ok();
			expect(meta.type).to.be('data');
			done();
		});
	});
});
