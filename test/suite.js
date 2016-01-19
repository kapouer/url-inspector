var inspector = require('..');
var expect = require('expect.js');

describe("url-inspector", function suite() {
	it("should inspect large file without downloading it entirely", function(done) {
		this.timeout(3000);
		inspector('https://cdn.kernel.org/pub/linux/kernel/v4.x/linux-4.3.3.tar.xz', function(err, meta) {
			expect(err).to.not.be.ok();
			expect(meta.title).to.be.ok();
			expect(meta.type).to.be('archive');
			done();
		});
	});
	it("should return meta with width and height", function(done) {
		this.timeout(5000);
		inspector('https://upload.wikimedia.org/wikipedia/commons/b/bd/1110_desktop_visual.jpg', function(err, meta) {
			expect(err).to.not.be.ok();
			expect(meta.type).to.be('image');
			expect(meta.title).to.be.ok();
			expect(meta.width).to.be.ok();
			expect(meta.height).to.be.ok();
			done();
		});
	});
	it("should return meta with thumbnail for a youtube video", function(done) {
		this.timeout(5000);
		inspector('https://www.youtube.com/watch?v=CtP8VABF5pk', function(err, meta) {
			expect(err).to.not.be.ok();
			expect(meta.type).to.be('video');
			expect(meta.thumbnail).to.be.ok();
			expect(meta.title).to.be.ok();
			expect(meta.embed).to.be.ok();
			expect(meta.width).to.be.ok();
			expect(meta.height).to.be.ok();
			expect(meta.duration).to.be.ok();
			done();
		});
	});
	it("should just work with github.com", function(done) {
		this.timeout(5000);
		inspector('https://github.com/kapouer/url-inspector', function(err, meta) {
			expect(err).to.not.be.ok();
			expect(meta.type).to.be('link');
			expect(meta.title).to.be.ok();
			expect(meta.size).to.not.be.ok();
			done();
		});
	});
	it("should error out with a message", function(done) {
		this.timeout(5000);
		inspector('https://ubnhiryuklu.tar/ctalo', function(err, meta) {
			expect(err).to.be.ok();
			expect(meta).to.not.be.ok();
			done();
		});
	});
	it("should error out with a 404", function(done) {
		this.timeout(5000);
		inspector('https://google.com/ctalo', function(err, meta) {
			expect(err).to.be(404);
			expect(meta).to.not.be.ok();
			done();
		});
	});
	it("should redirect properly", function(done) {
		this.timeout(5000);
		inspector('https://github.com/Stuk/jszip/archive/master.zip', function(err, meta) {
			expect(err).to.not.be.ok();
			expect(meta.type).to.be('archive');
			expect(meta.title).to.be.ok();
			done();
		});
	});

});
