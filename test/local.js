const inspector = require('..');
const expect = require('expect.js');
const express = require('express');
const assert = require('assert');

describe("local suite", function suite() {
	let app, server, host;
	before(function () {
		app = express();
		server = app.listen();
		host = "http://localhost:" + server.address().port;
		app.use(function (req, res, next) {
			if (req.path == "/latin.html") res.type("text/html; charset=iso-8859-1");
			else if (req.path == "/oembed.json") return res.json({
				"type": "video",
				"title": "Le Dauphin dauphin",
				"author_name": "Thibaud Gayral",
				"html": "<iframe src=\"https://player.vimeo.com/video/55084640?app_id=122963\" width=\"478\" height=\"204\" frameborder=\"0\" allow=\"autoplay; fullscreen; picture-in-picture\" allowfullscreen title=\"Le Dauphin dauphin\"></iframe><script src=\"https://some.com/file.js\"></script>",
				"width": 478,
				"height": 204,
				"duration": 238,
				"description": "Description text&eacute;",
				"thumbnail_url": "https://i.vimeocdn.com/video/439826901_295x166.jpg",
				"upload_date": "2012-12-07 04:24:19",
				'provider_name': '@Local_Host'
			});
			else if (req.path == "/video") {
				return res.sendStatus(403);
			}
			next();
		}, express.static(__dirname + '/fixtures'));
	});
	after(function () {
		if (server) server.close();
	});

	it("should convert from other charsets", function (done) {
		inspector(`${host}/latin.html`, function (err, meta) {
			expect(err).to.not.be.ok();
			expect(meta.title).to.be('Accentué à');
			done();
		});
	});

	it("should get title", function (done) {
		inspector(`${host}/lavieenbois.html`, function (err, meta) {
			expect(err).to.not.be.ok();
			expect(meta.title).to.be.ok();
			done();
		});
	});
	it("should not crash with svg", function (done) {
		inspector(`${host}/test.svg`, function (err, meta) {
			expect(err).to.not.be.ok();
			done();
		});
	});

	it("should correctly parse json-ld to get embedUrl", function (done) {
		this.timeout(10000);
		inspector(`${host}/jsonld.html`, function (err, meta) {
			expect(err).to.not.be.ok();
			expect(meta.type).to.be('video');
			expect(meta.date).to.be.ok();
			expect(meta.duration).to.be.ok();
			expect(meta.author).to.be.ok();
			done();
		});
	});

	it("should return embeddable content", function (done) {
		inspector(`${host}/songs.html`, function (err, meta) {
			expect(err).to.not.be.ok();
			expect(meta.type).to.be("audio");
			expect(meta.ext).to.be("html");
			expect(meta.html).to.be.ok();
			expect(meta.html.startsWith('<iframe')).to.be.ok();
			done();
		});
	});
	it("should not crash when oembed discovery fails", function (done) {
		inspector(`${host}/video`, {
			providers: [{
				name: "local",
				endpoints: [{
					schemes: [host.replace(/[|\\{}()[\]^$+*?.]/g, '\\$&') + '/*'],
					url: `${host}/oembed.{format}`,
					discovery: true
				}]
			}]
		}, function (err, meta) {
			delete meta.url;
			assert.deepStrictEqual(meta, {
				type: 'video',
				mime: 'text/html',
				description: "Description texté",
				duration: '00:03:58',
				size: 574,
				title: 'Le Dauphin dauphin',
				author: 'Thibaud Gayral',
				html: '<iframe src="https://player.vimeo.com/video/55084640?app_id=122963" width="478" height="204" frameborder="0" allow="autoplay; fullscreen; picture-in-picture" allowfullscreen="" title="Le Dauphin dauphin"></iframe>',
				script: "https://some.com/file.js",
				width: 478,
				height: 204,
				thumbnail: 'https://i.vimeocdn.com/video/439826901_295x166.jpg',
				site: 'Local Host',
				ext: 'html'
			});
			done();
		});
	});


});
