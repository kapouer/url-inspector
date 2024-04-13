import expect from 'expect.js';
import Inspector from 'url-inspector';

describe("remote suite", () => {
	const inspector = new Inspector();
	it("should inspect large file without downloading it entirely", async () => {
		const meta = await inspector.look('https://cdn.kernel.org/pub/linux/kernel/v4.x/linux-4.3.3.tar.xz');
		expect(meta.title).to.be.ok();
		expect(meta.size).to.be.greaterThan(80000000);
		expect(meta.type).to.be('link');
		expect(meta.what).to.be('file');
		expect(meta.ext).to.be('xz');
	}).timeout(10000);

	it("should return meta with width and height", async () => {
		const meta = await inspector.look('https://upload.wikimedia.org/wikipedia/commons/b/bd/1110_desktop_visual.jpg');
		expect(meta.type).to.be('image');
		expect(meta.what).to.be('image');
		expect(meta.ext).to.be('jpg');
		expect(meta.title).to.be.ok();
		expect(meta.width).to.be.ok();
		expect(meta.height).to.be.ok();
		expect(meta.date).to.be('2011-10-03');
	});

	it("should return meta with thumbnail for a youtube video", async () => {
		const meta = await inspector.look('https://www.youtube.com/watch?v=CtP8VABF5pk');
		expect(meta.type).to.be('embed');
		expect(meta.what).to.be('video');
		expect(meta.thumbnail).to.be.ok();
		expect(meta.title).to.be.ok();
		expect(meta.mime).to.be('text/html');
		expect(meta.ext).to.be('html');
		expect(meta.width).to.be.ok();
		expect(meta.height).to.be.ok();
		expect(meta).to.not.have.property("size");
	});

	it("should return meta with thumbnail for a figaro article", async () => {
		const meta = await inspector.look('http://www.lefigaro.fr/actualite-france/2016/02/07/01016-20160207ARTFIG00183-accident-de-bretigny-ce-que-la-sncf-aurait-prefere-cacher-a-la-justice.php');
		expect(meta.type).to.be('link');
		expect(meta.what).to.be('image');
		expect(meta.thumbnail).to.be.ok();
		expect(meta.title).to.be.ok();
		expect(meta.mime).to.be('text/html');
		expect(meta.source).to.be.ok();
		expect(meta.ext).to.be('html');
		expect(meta.width).to.be.ok();
		expect(meta.height).to.be.ok();
		expect(meta.duration).to.not.be.ok();
	}).timeout(10000);

	it("should support json+ld", async () => {
		const meta = await inspector.look('https://video.lefigaro.fr/figaro/video/presidentielle-americaine-peut-on-croire-les-sondages-cette-fois-ci/');
		expect(meta.type).to.be('embed');
		expect(meta.what).to.be('video');
		expect(meta.thumbnail).to.be.ok();
		expect(meta.title).to.be.ok();
		expect(meta.author).to.be('Le Figaro');
		expect(meta.duration).to.be('00:04:35');
		expect(meta.mime).to.be('text/html');
		expect(meta.source).to.be.ok();
		expect(meta.source.startsWith('https://video.lefigaro.fr')).to.be.ok();
		expect(meta.ext).to.be('html');
		expect(meta.html).to.be.ok();
		expect(meta.html.startsWith('<iframe ')).to.be.ok();
	}).timeout(10000);

	it("should support json+ld test 2", async () => {
		const meta = await inspector.look('https://www.lefigaro.fr/politique/presidentielle-2022-la-classe-politique-s-oppose-majoritairement-au-vote-par-anticipation-20210217');
		expect(meta.type).to.be('link');
		expect(meta.what).to.be('image');
		expect(meta.thumbnail).to.be.ok();
		expect(meta.title).to.be.ok();
		expect(meta.mime).to.be('text/html');
		expect(meta.author).to.be('Le Figaro');
		expect(Number.isNaN(Date.parse(meta.date))).to.not.be.ok();
		expect(meta.ext).to.be('html');
		expect(meta.html).to.be.ok();
		expect(meta.html.startsWith('<a ')).to.be.ok();
	}).timeout(10000);

	it("should just work with github.com", async () => {
		const meta = await inspector.look('https://github.com/kapouer/url-inspector');
		expect(meta.what).to.be('page');
		expect(meta.type).to.be('link');
		expect(meta.title).to.be.ok();
		expect(meta.size).to.not.be.ok();
	}).timeout(10000);

	it("should resolve icon href relative to current origin", async () => {
		const meta = await inspector.look('https://upload.wikimedia.org/wikipedia/fr/thumb/3/34/Toronto_FC_%28logo%29.svg/1200px-Toronto_FC_%28logo%29.svg.png');
		expect(meta.type).to.be('image');
		expect(meta.what).to.be('image');
		expect(meta.icon).to.be("https://commons.wikimedia.org/static/favicon/commons.ico");
	}).timeout(10000);

	it("should error out with a message", async () => {
		try {
			await inspector.look('https://ubnhiryuklu.tar/ctalo');
		} catch (err) {
			expect(err).to.be.ok();
		}
	}).timeout(10000);

	it("should error out with a 404", async () => {
		try {
			await inspector.look('https://google.com/ctalo');
		} catch (err) {
			expect(err.statusCode).to.be(404);
		}
	}).timeout(10000);

	it("should redirect properly", async () => {
		const meta = await inspector.look('https://github.com/Stuk/jszip/archive/master.zip');
		expect(meta.type).to.be('link');
		expect(meta.what).to.be('file');
		expect(meta.title).to.be.ok();
	}).timeout(10000);


	it("should work with vimeo...", async () => {
		const meta = await inspector.look('https://vimeo.com/75809732');
		expect(meta.type).to.be('embed');
		expect(meta.what).to.be('video');
		expect(meta.thumbnail).to.be.ok();
	}).timeout(10000);

	it("should work with radiofrance", async () => {
		const meta = await inspector.look('https://www.radiofrance.fr/franceculture/podcasts/la-methode-scientifique/marie-curie-une-intelligence-irradiante-8386710#undefined');
		expect(meta.type).to.be('link');
		expect(meta.what).to.be('page');
		expect(meta.thumbnail).to.be.ok();
	});

	it("should work with vimeo with rewrite", async () => {
		const meta = await inspector.look('https://player.vimeo.com/video/383255556?color=ffffff&portrait=0&autoplay=1');
		expect(meta.type).to.be('embed');
		expect(meta.what).to.be('video');
		expect(meta.title).to.be.ok();
		expect(meta.source).to.be.ok();
	}).timeout(10000);


	it("should change type if schema has embed", async () => {
		const meta = await inspector.look('http://video.lefigaro.fr/figaro/video/une-voiture-engloutie-par-un-sinkhole-en-chine/3919138012001/');
		expect(meta.type).to.be('embed');
		expect(meta.what).to.be('video');
		expect(meta.thumbnail).to.be.ok();
	}).timeout(10000);

	it("should not change type if schema has no embed", async () => {
		const meta = await inspector.look('http://www.lefigaro.fr/actualite-france/2016/01/07/01016-20160107LIVWWW00158-en-direct-un-homme-abattu-devant-un-commissariat-de-police-a-paris.php');
		expect(meta.what).to.be('image');
		expect(meta.type).to.be('link');
		expect(meta.thumbnail).to.be.ok();
	}).timeout(10000);

	it("should append description to title and get picture", async () => {
		const url = 'https://twitter.com/kapouer/status/731420341927587840?ref_src=twsrc%5Etfw';
		const meta = await inspector.look(url);
		expect(meta.url).to.be(url);
		expect(meta.what).to.be('page');
		expect(meta.type).to.be('embed');
		expect(meta.date).to.be.ok();
		expect(meta.author).to.be.ok();
		expect(meta.size).to.not.be.ok();
		expect(meta.description).to.be('copycat');
		// no longer inspecting the page itself to avoid too many requests
		// expect(meta.thumbnail).to.be.ok();
		expect(meta.html.includes('<script')).to.not.be.ok();
	}).timeout(10000);

	it("should append description to title and get picture, try2", async () => {
		const url = 'https://twitter.com/nicojamain/status/1585536111111245825';
		const meta = await inspector.look(url);
		expect(meta.url).to.be(url);
		expect(meta.what).to.be('page');
		expect(meta.type).to.be('embed');
		expect(meta.date).to.be.ok();
		expect(meta.author).to.be.ok();
		expect(meta.size).to.not.be.ok();
		expect(meta.description).to.be('La @NASA va donc annoncer aujourd’hui à 20h heure française deux découvertes MAJEURES faites récemment sur Mars !! Rendez-vous à été donné à la presse internationale.');
		// no longer inspecting the page itself to avoid too many requests
		// expect(meta.thumbnail).to.be.ok();
		expect(meta.html.includes('<script')).to.not.be.ok();
	}).timeout(10000);

	it("should get google map metadata", async () => {
		const meta = await inspector.look('https://goo.gl/maps/S5HZeNf3AGwAsrTi9');
		expect(meta.what).to.be('page');
		expect(meta.type).to.be('embed');
		expect(meta.description).to.be('Cité Lefort, 86490 Beaumont Saint-Cyr');
		expect(meta.title).to.be('Cooperative Agricole de la Tricherie');
		expect(meta.site).to.be('Google Maps');
		expect(meta.thumbnail).to.be.ok();
	}).timeout(10000);

	it("should follow 303 redirect and send cookies back", async () => {
		const meta = await inspector.look('http://www.nytimes.com/2016/05/31/us/politics/donald-trump-hong-kong-riverside-south.html?_r=0');
		expect(meta.what).to.be('page');
		expect(meta.type).to.be('embed');
		expect(meta.html).to.be.ok();
		expect(meta.thumbnail).to.be.ok();
	}).timeout(10000);

	it("should set correct html output for image type when image is found", async () => {
		const meta = await inspector.look('https://www.flickr.com/photos/duxbury_rambler/36308366073/in/photolist-XjrSgB-7B89Cj-9xqk6P-a5hq2M-bWzztg-hzYee3-eiZKn3-BBtFpo-xjerPJ-8qM1kU-6h42EF-cdWYfo-bWzAbx-AGgbPN-wDQgHQ-bWzDbH-BDMMMz-NGeF5k-BBtF1h-xqYdC6-GXcyDu-DJJAXZ-H1gS5m-v58BWL-NY1dBW-QeSeoW-NDkyKV-cdWXSW-u3wS1d-B6gT9H-VdLyyW-eiU48H-6oPpqH-Ggjd7G-PUzWio-xoDKcy-uZ8iP6-dQbfRo-AECzjD-z5Vfoo-Tpnv84-cdWXay-fhRuWA-yVMe7E-6KRyqV-KtNc7D-Yx5Cgt-KTEjN5-ebo2vv-Fokmkv');
		expect(meta.type).to.be('embed');
		expect(meta.what).to.be('image');
		expect(meta.html.includes('<a ')).to.be.ok();
		expect(meta.script).to.be.ok();
	}).timeout(10000);

	it("should return meta with thumbnail for a youtube video embed url", async () => {
		const meta = await inspector.look('https://www.youtube.com/embed/W7OY8TeglnM');
		expect(meta.url).to.be('https://www.youtube.com/watch?v=W7OY8TeglnM');
		expect(meta.what).to.be('video');
		expect(meta.type).to.be('embed');
		expect(meta.thumbnail).to.be.ok();
		expect(meta.title).to.be.ok();
		expect(meta.source).to.be.ok();
		expect(meta.ext).to.be('html');
		expect(meta).to.not.have.property("size");
		expect(meta.width).to.be.ok();
		expect(meta.height).to.be.ok();
	}).timeout(10000);

	it("should get keywords", async () => {
		const meta = await inspector.look('https://i.f1g.fr/media/cms/616x347_crop/2021/03/10/975f688ae59c60ad216d30151defecbdb08730ec31f86e51c92bd51b87516648.jpg');
		expect(meta.keywords.join(',')).to.be("parliament,politics,government,horizontal");
	}).timeout(10000);

	it("should not fail on redirection", async () => {
		const meta = await inspector.look('http://atag-europe.com/');
		expect(meta.what).to.be('page');
		expect(meta.html).to.be.ok();
		expect(meta.html.startsWith('<blockquote ')).to.be.ok();
		expect(meta.type).to.be('embed');
	}).timeout(10000);

	it("should get an embed for dailymotion", async () => {
		const meta = await inspector.look('https://www.dailymotion.com/video/x8ez91s');
		expect(meta.url).to.be('https://www.dailymotion.com/video/x8ez91s');
		expect(meta.what).to.be('video');
		expect(meta.type).to.be('embed');
		expect(meta.thumbnail).to.be.ok();
		expect(meta.title).to.be.ok();
	}).timeout(10000);

	it("should get an embed for tiktok", async () => {
		const meta = await inspector.look('https://www.tiktok.com/@scout2015/video/6718335390845095173');
		expect(meta.what).to.be('video');
		expect(meta.type).to.be('embed');
		expect(meta.html).to.be.ok();
		expect(meta.html.startsWith('<blockquote')).to.be.ok();
		expect(meta.thumbnail).to.be.ok();
		expect(meta.title).to.be.ok();
		expect(meta.author).to.be('Scout, Suki & Stella');
		expect(meta.script).to.be('https://www.tiktok.com/embed.js');
		expect(meta.icon).to.be.ok();
	}).timeout(10000);

});
