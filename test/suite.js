var inspector = require('..')();
var expect = require('expect.js');

describe("url-inspector", function suite() {
	it("should inspect large file without downloading it entirely", function(done) {
		this.timeout(2000);
		inspector('https://cdn.kernel.org/pub/linux/kernel/v4.x/linux-4.3.3.tar.xz', function(err, meta) {
			expect(err).to.not.be.ok();
			expect(meta.type).to.be('data');
			done();
		});
	});
	it("should return meta with thumbnail as data-uri", function(done) {
		this.timeout(2000);
		inspector('https://upload.wikimedia.org/wikipedia/commons/b/bd/1110_desktop_visual.jpg', function(err, meta) {
			expect(err).to.not.be.ok();
			expect(meta.type).to.be('image');
			expect(meta.thumbnail.indexOf('image/jpeg') > 0).to.be.ok();
			done();
		});
	});
});
