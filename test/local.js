var inspector = require('..');
var expect = require('expect.js');
var express = require('express');

describe("local suite", function suite() {
	var app, server, host;
	before(function() {
		app = express();
		server = app.listen();
		host = "http://localhost:" + server.address().port;
		app.use(function(req, res, next) {
			if (req.path == "/latin.html") res.type("text/html; charset=iso-8859-1");
			next();
		}, express.static(__dirname + '/fixtures'));
	});
	after(function() {
		if (server) server.close();
	});

	it("should convert from other charsets", function(done) {
		inspector(`${host}/latin.html`, function(err, meta) {
			expect(err).to.not.be.ok();
			expect(meta.title).to.be('Accentué à');
			done();
		});
	});

	it("should get title", function(done) {
		inspector(`${host}/lavieenbois.html`, function(err, meta) {
			expect(err).to.not.be.ok();
			expect(meta.title).to.be.ok();
			done();
		});
	});
	it("should return embeddable content", function(done) {
		inspector(`${host}/songs.html`, function(err, meta) {
			expect(err).to.not.be.ok();
			expect(meta.type).to.be("audio");
			expect(meta.ext).to.be("html");
			expect(meta.html).to.be.ok();
			expect(meta.html.startsWith('<iframe')).to.be.ok();
			done();
		});
	});
	it("should not crash with svg", function(done) {
		inspector(`${host}/test.svg`, function(err, meta) {
			expect(err).to.not.be.ok();
			done();
		});
	});


});
