var inspector = require('..');
var expect = require('expect.js');

describe("file suite", function suite() {
	it("should inspect relative path", function(done) {
		inspector(`file://./test/fixtures/songs.html`, {file: true}, function(err, meta) {
			expect(err).to.not.be.ok();
			expect(meta.type).to.be("audio");
			expect(meta.ext).to.be("html");
			expect(meta.html).to.be.ok();
			expect(meta.html.startsWith('<audio')).to.be.ok();
			done();
		});
	});

	it("should inspect absolute path", function(done) {
		inspector(`file://${__dirname}/fixtures/lavieenbois.html`, {file: true}, function(err, meta) {
			expect(err).to.not.be.ok();
			expect(meta.title).to.be.ok();
			done();
		});
	});
});
