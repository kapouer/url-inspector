import expect from 'expect.js';
import Inspector from 'url-inspector';
import express from 'express';
import assert from 'node:assert';

describe("local suite", () => {
	let app, server, host, inspector, inspectorWithOEmbed, inspectorWithRedirection;

	before((ready) => {
		app = express();
		server = app.listen(() => {
			host = "http://localhost:" + server.address().port;
			inspector = new Inspector();
			inspectorWithOEmbed = new Inspector({
				providers: [{
					name: "local",
					endpoints: [{
						schemes: [host.replace(/[|\\{}()[\]^$+*?.]/g, '\\$&') + '/*'],
						url: `${host}/oembed.{format}`,
						discovery: true
					}]
				}]
			});
			inspectorWithRedirection = new Inspector({
				providers: [{
					name: "local2",
					endpoints: [{
						schemes: ['.*'],
						redirect(obj) {
							if (obj.pathname == "/image/test") {
								obj.pathname = '/image/toto';
								return true;
							}
						}
					}]
				}]
			});
			ready();
		});
		app.use((req, res, next) => {
			if (req.path == "/latin.html" || req.path == "/lavieenbois.html") {
				res.type("text/html; charset=iso-8859-1");
			} else if (req.path == "/oembed.json") {
				return res.json({
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
			} else if (req.path == "/video") {
				return res.sendStatus(403);
			} else if (req.path == "/image/toto") {
				req.url = '/image.png';
			} else if (req.path == "/image/test") {
				return res.sendStatus(500);
			}
			next();
		}, express.static('./test/fixtures'));
	});

	after(() => {
		if (server) server.close();
	});

	it("should convert from other charsets", async () => {
		const meta = await inspector.look(`${host}/latin.html`);
		expect(meta.title).to.be('Accentué à');
	});

	it("should normalize meta.title", async () => {
		const user = inspector.norm({ title: '<b>My own title</b>' });
		expect(user.title).to.be('My own title');
	});

	it("should get title and description", async () => {
		const meta = await inspector.look(`${host}/lavieenbois.html`);
		expect(meta.title).to.be("Créations © Wood & art");
		expect(meta.description).to.be("créations sculptures test");
	});
	it("should not crash with svg", async () => {
		const meta = await inspector.look(`${host}/test.svg`);
		expect(meta.mime).to.be('image/svg+xml');
		expect(meta.type).to.be('image');
		expect(meta.what).to.be('image');
		expect(meta.width).to.be(256);
		expect(meta.height).to.be(256);
	});

	it("should correctly parse json-ld to get embedUrl and inspect thumbnail to get dimensions of video", async () => {
		const meta = await inspector.look(`${host}/jsonld.html`);
		expect(meta.what).to.be('video');
		expect(meta.type).to.be('embed');
		expect(meta.date).to.be.ok();
		expect(meta.width).to.be.ok();
		expect(meta.height).to.be.ok();
		expect(meta.duration).to.be.ok();
		expect(meta.author).to.be.ok();
	});

	it("should return embeddable content", async () => {
		const meta = await inspector.look(`${host}/songs.html`);
		// the actual online url is broken
		expect(meta.what).to.be("audio");
		expect(meta.type).to.be("embed");
		expect(meta.ext).to.be("html");
		expect(meta.html).to.be.ok();
		expect(meta.html.startsWith('<iframe')).to.be.ok();
	});

	it("should fetch thumbnailUrl from nytimes jsonld", async () => {
		const meta = await inspector.look(`${host}/nytimes.html`);
		expect(meta.thumbnail).to.be.ok();
		expect(meta.what).to.be("video");
		expect(meta.type).to.be("embed");
		expect(meta.ext).to.be("html");
		expect(meta.html).to.be.ok();
		expect(meta.html.startsWith('<iframe')).to.be.ok();
	}).timeout(3000);

	it("should not crash when oembed discovery fails", async () => {
		const meta = await inspectorWithOEmbed.look(`${host}/video`);
		delete meta.url;
		assert.deepStrictEqual(meta, {
			what: 'video',
			type: 'embed',
			mime: 'text/html',
			description: "Description texté",
			duration: '00:03:58',
			title: 'Le Dauphin dauphin',
			author: 'Thibaud Gayral',
			date: "2012-12-07",
			source: 'https://player.vimeo.com/video/55084640?app_id=122963',
			html: '<iframe src="https://player.vimeo.com/video/55084640?app_id=122963" width="478" height="204" frameborder="0" allow="autoplay; fullscreen; picture-in-picture" allowfullscreen title="Le Dauphin dauphin"></iframe>',
			script: "https://some.com/file.js",
			width: 478,
			height: 204,
			thumbnail: 'https://i.vimeocdn.com/video/439826901_295x166.jpg',
			site: 'Local Host',
			ext: 'html'
		});

	});

	it("should inspect only once when url is redirected by provider", async () => {
		const meta = await inspectorWithRedirection.look(`${host}/image/test`);
		expect(new URL(meta.url).pathname).to.be('/image/toto');
	});

	it("should parse instagram page", async () => {
		const meta = await inspectorWithOEmbed.look(`${host}/insta.html`);
		expect(meta.what).to.be("video");
		expect(meta.type).to.be("embed");
		expect(meta.mime).to.be("text/html");
		expect(meta.title).to.be("Le Dauphin dauphin");
		expect(meta.description).to.be.ok();
		expect(meta.html).to.contain("<iframe");
		expect(meta).to.not.have.property("error");
	}).timeout(10000);

});
