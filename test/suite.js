var inspector = require('..');
var expect = require('expect.js');

describe("url-inspector", function suite() {
	it("should get title from http://www.lavieenbois.com/", function(done) {
		this.timeout(5000);
		inspector('http://www.lavieenbois.com/', function(err, meta) {
			expect(err).to.not.be.ok();
			expect(meta.title).to.be.ok();
			done();
		});
	});
	it("should return embeddable content at https://myspace.com/unefemmemariee/music/songs", function(done) {
		this.timeout(5000);
		inspector('https://myspace.com/unefemmemariee/music/songs', function(err, meta) {
			expect(err).to.not.be.ok();
			expect(meta.type).to.be("audio");
			expect(meta.ext).to.be("html");
			expect(meta.html).to.be.ok();
			expect(meta.html.startsWith('<audio')).to.be.ok();
			done();
		});
	});
	it("should inspect large file without downloading it entirely", function(done) {
		this.timeout(3000);
		inspector('https://cdn.kernel.org/pub/linux/kernel/v4.x/linux-4.3.3.tar.xz', function(err, meta) {
			expect(err).to.not.be.ok();
			expect(meta.title).to.be.ok();
			expect(meta.size).to.be.greaterThan(80000000);
			expect(meta.type).to.be('archive');
			expect(meta.ext).to.be('xz');
			done();
		});
	});
	it("should return meta with width and height", function(done) {
		this.timeout(5000);
		inspector('https://upload.wikimedia.org/wikipedia/commons/b/bd/1110_desktop_visual.jpg', function(err, meta) {
			expect(err).to.not.be.ok();
			expect(meta.type).to.be('image');
			expect(meta.ext).to.be('jpg');
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
			expect(meta.ext).to.be('html');
			expect(meta.size).to.not.be.ok();
			expect(meta.width).to.be.ok();
			expect(meta.height).to.be.ok();
			expect(meta.duration).to.be.ok();
			done();
		});
	});
	it("should return meta with thumbnail for a figaro article", function(done) {
		this.timeout(5000);
		inspector('http://www.lefigaro.fr/actualite-france/2016/02/07/01016-20160207ARTFIG00183-accident-de-bretigny-ce-que-la-sncf-aurait-prefere-cacher-a-la-justice.php', function(err, meta) {
			expect(err).to.not.be.ok();
			expect(meta.type).to.be('link');
			expect(meta.thumbnail).to.be.ok();
			expect(meta.title).to.be.ok();
			expect(meta.embed).to.not.be.ok();
			expect(meta.ext).to.be('html');
			expect(meta.width).to.not.be.ok();
			expect(meta.height).to.not.be.ok();
			expect(meta.duration).to.not.be.ok();
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
	/* disabled because discovery is ON and in that case oembed is ignored
	it("should inspect even when oembed endpoint fails", function(done) {
		this.timeout(5000);
		inspector('https://vimeo.com/75809732', function(err, meta) {
			expect(err).to.not.be.ok();
			expect(meta.error).to.be(403);
			expect(meta.type).to.be('video');
			expect(meta.thumbnail).to.be.ok();
			done();
		});
	});
	*/
	it("should change type if schema has embed", function(done) {
		this.timeout(5000);
		inspector('http://video.lefigaro.fr/figaro/video/une-voiture-engloutie-par-un-sinkhole-en-chine/3919138012001/', function(err, meta) {
			expect(err).to.not.be.ok();
			expect(meta.type).to.be('video');
			expect(meta.thumbnail).to.be.ok();
			done();
		});
	});
	it("should not change type if schema has no embed", function(done) {
		this.timeout(5000);
		inspector('http://www.lefigaro.fr/actualite-france/2016/01/07/01016-20160107LIVWWW00158-en-direct-un-homme-abattu-devant-un-commissariat-de-police-a-paris.php', function(err, meta) {
			expect(err).to.not.be.ok();
			expect(meta.type).to.be('link');
			expect(meta.thumbnail).to.be.ok();
			done();
		});
	});
	it("should append description to title and get picture", function(done) {
		this.timeout(5000);
		inspector('https://twitter.com/kapouer/status/731420341927587840', function(err, meta) {
			expect(err).to.not.be.ok();
			expect(meta.type).to.be('embed');
			expect(meta.size).to.not.be.ok();
			expect(meta.description).to.be.ok();
			expect(meta.thumbnail).to.be.ok();
			done();
		});
	});
	it("should convert from other charsets", function(done) {
		this.timeout(5000);
		inspector('http://www.canalplus.fr/c-emissions/le-petit-journal/pid6515-le-petit-journal.html?vid=1392689', function(err, meta) {
			expect(err).to.not.be.ok();
			expect(meta.title).to.contain('à');
			done();
		});
	});
	it("should get google map metadata", function(done) {
		this.timeout(5000);
		inspector('https://www.google.fr/maps/place/86000+Poitiers/@46.5846876,0.3363644,13z/data=!3m1!4b1!4m5!3m4!1s0x47fdbe72439eb3ab:0x97de2319c5e09093!8m2!3d46.580224!4d0.340375?hl=fr', function(err, meta) {
			expect(err).to.not.be.ok();
			expect(meta.type).to.be('embed');
			expect(meta.description).to.be('86000');
			expect(meta.title).to.be('Poitiers');
			expect(meta.thumbnail).to.be.ok();
			done();
		});
	});
	it("should follow 303 redirect and send cookies back", function(done) {
		this.timeout(5000);
		inspector('http://www.nytimes.com/2016/05/31/us/politics/donald-trump-hong-kong-riverside-south.html?_r=0', function(err, meta) {
			expect(err).to.not.be.ok();
			expect(meta.type).to.be('embed');
			expect(meta.html).to.be.ok();
			expect(meta.thumbnail).to.be.ok();
			done();
		});
	});
	it("should give priority of oembed over twitter card", function(done) {
		this.timeout(5000);
		inspector('https://vine.co/v/Ml16lZVTTxe', function(err, meta) {
			expect(err).to.not.be.ok();
			expect(meta.type).to.be('video');
			expect(meta.html).to.be.ok();
			expect(meta.thumbnail).to.be.ok();
			done();
		});
	});
	it("should set correct html output for image type when image is found", function(done) {
		this.timeout(5000);
		inspector('https://www.instagram.com/p/BFYUGGNJ1TJ/', function(err, meta) {
			expect(err).to.not.be.ok();
			expect(meta.type).to.be('image');
			expect(meta.html.startsWith('<img')).to.be.ok();
			expect(meta.thumbnail).to.be.ok();
			done();
		});
	});

});
