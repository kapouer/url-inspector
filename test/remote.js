const inspector = require('..');
const expect = require('expect.js');

describe("remote suite", () => {
	it("should return embeddable content at https://myspace.com/unefemmemariee/music/songs", async () => {
		const meta = await inspector('https://myspace.com/rockbluesonemanbandquotch/music/song/testing-one-1408200-1424584');
		expect(meta.type).to.be("audio");
		expect(meta.ext).to.be("html");
		expect(meta.html).to.be.ok();
		expect(meta.html.startsWith('<iframe')).to.be.ok();
	}).timeout(10000);

	it("should inspect large file without downloading it entirely", async () => {
		const meta = await inspector('https://cdn.kernel.org/pub/linux/kernel/v4.x/linux-4.3.3.tar.xz');
		expect(meta.title).to.be.ok();
		expect(meta.size).to.be.greaterThan(80000000);
		expect(meta.type).to.be('archive');
		expect(meta.ext).to.be('xz');
	}).timeout(10000);

	it("should return meta with width and height", async () => {
		const meta = await inspector('https://upload.wikimedia.org/wikipedia/commons/b/bd/1110_desktop_visual.jpg');
		expect(meta.type).to.be('image');
		expect(meta.ext).to.be('jpg');
		expect(meta.title).to.be.ok();
		expect(meta.width).to.be.ok();
		expect(meta.height).to.be.ok();
		expect(meta.date).to.be('2011-10-03');
	});

	it("should return meta with thumbnail for a youtube video", async () => {
		const meta = await inspector('https://www.youtube.com/watch?v=CtP8VABF5pk');
		expect(meta.type).to.be('video');
		expect(meta.thumbnail).to.be.ok();
		expect(meta.title).to.be.ok();
		expect(meta.mime).to.be('text/html');
		expect(meta.ext).to.be('html');
		expect(meta.size).to.not.be.ok();
		expect(meta.width).to.be.ok();
		expect(meta.height).to.be.ok();
	});

	it("should return meta with thumbnail for a figaro article", async () => {
		const meta = await inspector('http://www.lefigaro.fr/actualite-france/2016/02/07/01016-20160207ARTFIG00183-accident-de-bretigny-ce-que-la-sncf-aurait-prefere-cacher-a-la-justice.php');
		expect(meta.type).to.be('link');
		expect(meta.thumbnail).to.be.ok();
		expect(meta.title).to.be.ok();
		expect(meta.mime).to.be('text/html');
		expect(meta.source).to.not.be.ok();
		expect(meta.ext).to.be('html');
		expect(meta.width).to.not.be.ok();
		expect(meta.height).to.not.be.ok();
		expect(meta.duration).to.not.be.ok();
	}).timeout(10000);

	it("should support json+ld", async () => {
		const meta = await inspector('https://video.lefigaro.fr/figaro/video/presidentielle-americaine-peut-on-croire-les-sondages-cette-fois-ci/');
		expect(meta.type).to.be('video');
		expect(meta.thumbnail).to.be.ok();
		expect(meta.title).to.be.ok();
		expect(meta.author).to.be('Le Figaro');
		expect(meta.duration).to.be('00:04:35');
		expect(meta.mime).to.be('text/html');
		expect(meta.source).to.be.ok();
		expect(meta.source.indexOf('players.brightcove.net') > 0).to.be.ok();
		expect(meta.ext).to.be('html');
		expect(meta.html).to.be.ok();
		expect(meta.html.startsWith('<iframe src')).to.be.ok();
	}).timeout(10000);

	it("should support json+ld test 2", async () => {
		const meta = await inspector('https://www.lefigaro.fr/politique/presidentielle-2022-la-classe-politique-s-oppose-majoritairement-au-vote-par-anticipation-20210217');
		expect(meta.type).to.be('link');
		expect(meta.thumbnail).to.be.ok();
		expect(meta.title).to.be.ok();
		expect(meta.mime).to.be('text/html');
		expect(meta.author).to.be.ok('Dinah Cohen');
		expect(Number.isNaN(Date.parse(meta.date))).to.not.be.ok();
		expect(meta.ext).to.be('html');
		expect(meta.html).to.be.ok();
		expect(meta.html.startsWith('<a href')).to.be.ok();
	}).timeout(10000);

	it("should just work with github.com", async () => {
		const meta = await inspector('https://github.com/kapouer/url-inspector');
		expect(meta.type).to.be('link');
		expect(meta.title).to.be.ok();
		expect(meta.size).to.not.be.ok();
	}).timeout(10000);

	it("should resolve icon href relative to current origin", async () => {
		const meta = await inspector('https://upload.wikimedia.org/wikipedia/fr/thumb/3/34/Toronto_FC_%28logo%29.svg/1200px-Toronto_FC_%28logo%29.svg.png');
		expect(meta.type).to.be('image');
		expect(meta.icon).to.be("https://commons.wikimedia.org/static/favicon/commons.ico");
	}).timeout(10000);

	it("should error out with a message", async () => {
		try {
			await inspector('https://ubnhiryuklu.tar/ctalo');
		} catch (err) {
			expect(err).to.be.ok();
		}
	}).timeout(10000);

	it("should error out with a 404", async () => {
		try {
			await inspector('https://google.com/ctalo');
		} catch (err) {
			expect(err).to.be(404);
		}
	}).timeout(10000);

	it("should redirect properly", async () => {
		const meta = await inspector('https://github.com/Stuk/jszip/archive/master.zip');
		expect(meta.type).to.be('archive');
		expect(meta.title).to.be.ok();
	}).timeout(10000);


	it("should work with vimeo...", async () => {
		const meta = await inspector('https://vimeo.com/75809732');
		expect(meta.type).to.be('video');
		expect(meta.thumbnail).to.be.ok();
	});


	it("should change type if schema has embed", async () => {
		const meta = await inspector('http://video.lefigaro.fr/figaro/video/une-voiture-engloutie-par-un-sinkhole-en-chine/3919138012001/');
		expect(meta.type).to.be('video');
		expect(meta.thumbnail).to.be.ok();
	}).timeout(10000);

	it("should not change type if schema has no embed", async () => {
		const meta = await inspector('http://www.lefigaro.fr/actualite-france/2016/01/07/01016-20160107LIVWWW00158-en-direct-un-homme-abattu-devant-un-commissariat-de-police-a-paris.php');
		expect(meta.type).to.be('link');
		expect(meta.thumbnail).to.be.ok();
	}).timeout(10000);

	it("should append description to title and get picture", async () => {
		const url = 'https://twitter.com/kapouer/status/731420341927587840?ref_src=twsrc%5Etfw';
		const meta = await inspector(url);
		expect(meta.url).to.be(url);
		expect(meta.type).to.be('embed');
		expect(meta.date).to.be.ok();
		expect(meta.author).to.be.ok();
		expect(meta.size).to.not.be.ok();
		expect(meta.description).to.be.ok();
		//expect(meta.thumbnail).to.be.ok();
		expect(meta.html.includes('<script')).to.not.be.ok();
	}).timeout(10000);

	it("should get google map metadata", async () => {
		const meta = await inspector('https://goo.gl/maps/S5HZeNf3AGwAsrTi9');
		expect(meta.type).to.be('embed');
		expect(meta.description).to.be('9 Rue de la Gare, 86490 Beaumont Saint-Cyr');
		expect(meta.title).to.be('Coopérative Agricole La Tricherie');
		expect(meta.site).to.be('Google Maps');
		expect(meta.thumbnail).to.be.ok();
	}).timeout(10000);

	it("should follow 303 redirect and send cookies back", async () => {
		const meta = await inspector('http://www.nytimes.com/2016/05/31/us/politics/donald-trump-hong-kong-riverside-south.html?_r=0');
		expect(meta.type).to.be('embed');
		expect(meta.html).to.be.ok();
		expect(meta.thumbnail).to.be.ok();
	}).timeout(10000);

	it("should set correct html output for image type when image is found", async () => {
		const meta = await inspector('https://www.flickr.com/photos/duxbury_rambler/36308366073/in/photolist-XjrSgB-7B89Cj-9xqk6P-a5hq2M-bWzztg-hzYee3-eiZKn3-BBtFpo-xjerPJ-8qM1kU-6h42EF-cdWYfo-bWzAbx-AGgbPN-wDQgHQ-bWzDbH-BDMMMz-NGeF5k-BBtF1h-xqYdC6-GXcyDu-DJJAXZ-H1gS5m-v58BWL-NY1dBW-QeSeoW-NDkyKV-cdWXSW-u3wS1d-B6gT9H-VdLyyW-eiU48H-6oPpqH-Ggjd7G-PUzWio-xoDKcy-uZ8iP6-dQbfRo-AECzjD-z5Vfoo-Tpnv84-cdWXay-fhRuWA-yVMe7E-6KRyqV-KtNc7D-Yx5Cgt-KTEjN5-ebo2vv-Fokmkv');
		expect(meta.type).to.be('image');
		expect(meta.html.includes('<img ')).to.be.ok();
	}).timeout(10000);

	it("should return meta with thumbnail for a youtube video embed url", async () => {
		const meta = await inspector('https://www.youtube.com/embed/W7OY8TeglnM');
		expect(meta.url).to.be('https://www.youtube.com/watch?v=W7OY8TeglnM');
		expect(meta.type).to.be('video');
		expect(meta.thumbnail).to.be.ok();
		expect(meta.title).to.be.ok();
		expect(meta.source).to.be.ok();
		expect(meta.ext).to.be('html');
		expect(meta.size).to.not.be.ok();
		expect(meta.width).to.be.ok();
		expect(meta.height).to.be.ok();
	}).timeout(10000);

	it("should get keywords", async () => {
		const meta = await inspector('https://i.f1g.fr/media/cms/616x347_crop/2021/03/10/975f688ae59c60ad216d30151defecbdb08730ec31f86e51c92bd51b87516648.jpg');
		expect(meta.keywords.join(',')).to.be("parliament,politics,government,horizontal");
	}).timeout(10000);

	it("should not fail on redirection", async () => {
		const meta = await inspector('http://atag-europe.com/');
		expect(meta.type).to.be('embed');
	}).timeout(10000);

});
