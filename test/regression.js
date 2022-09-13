const debug = require('debug');
const inspector = require('..');
const expect = require('expect.js');

describe("regression suite", () => {
	it("no 403 on laprovence", async () => {
		const meta = await inspector('https://www.laprovence.com/actu/en-direct/6620418/mercato-om-valence-pense-a-alvaro.html');
		expect(meta.type).to.be("link");
	}).timeout(10000);

	it("no 403 on lesteclair", async () => {
		const meta = await inspector('https://www.lest-eclair.fr/id335530/article/2022-01-25/lebo-mothiba-va-rejoindre-lestac');
		expect(meta.type).to.be("link");
	}).timeout(10000);

	it("no connection reset on andra", async () => {
		const meta = await inspector('https://www.andra.fr/espace-producteurs/conditions-de-prise-en-charge-des-objets-radioactifs');
		expect(meta.type).to.be("link");
	}).timeout(10000);

	it("no 403 on team viewer", async () => {
		const meta = await inspector('https://www.teamviewer.com/en-us/download/windows/');
		expect(meta.type).to.be("link");
	}).timeout(10000);

	it("no 403 on sport.sky", async () => {
		const meta = await inspector('https://sport.sky.de/fussball/artikel/wolfsburg-transfer-news-weghorst-kurz-vor-wechsel-in-die-premier-league-sky-info/12528713/34942');
		expect(meta.type).to.be("link");
	}).timeout(10000);

	it("no redirect to login on instagram", async () => {
		const meta = await inspector('https://www.instagram.com/p/CZdfmzqvOqT/');
		expect(meta.type).to.be("embed");
		expect(meta.mime).to.be("text/html");
		expect(meta.title).to.be("See you soon Queenstown 👋🏼");
		expect(meta.description).to.be.ok();
		expect(meta.html).to.contain("<blockquote");
		expect(meta).to.not.have.property("error");
	}).timeout(10000);

	it("no crash with relative canonical url", async () => {
		const meta = await inspector('https://project-everest.github.io');
		expect(meta.type).to.be("link");
	}).timeout(10000);

	it("should get redirected favicon", async () => {
		const meta = await inspector('https://www.eurosport.fr/ski-alpin/pekin-2022/2022/slalom-2e-manche-clement-noel_vid1634674/embed-video.shtml');
		expect(meta.icon).to.be.ok();
	});

	it("no json-ld failure on figaro", async () => {
		try {
			debug.enable('url-inspector');
			const meta = await inspector('https://www.lefigaro.fr/flash-eco/l-ukraine-ferme-son-espace-aerien-pour-l-aviation-civile-20220224');
			expect(meta.type).to.be("image");
		} catch (ex) {
			expect(ex).to.not.be.ok();
		} finally {
			debug.disable('url-inspector');
		}

	}).timeout(5000);

	it("should inspect image with number as title", async () => {
		const meta = await inspector(`file://./test/fixtures/image.png`, { file: true });
		expect(meta.title).to.be('36771364');
		expect(meta.type).to.be('image');
	});

	it("should return a full url for thumbnail", async () => {
		const meta = await inspector('https://www.calameo.com/read/007173083c1207babc7c2');
		expect(meta.thumbnail.startsWith('https://')).to.be(true);
	}).timeout(10000);
});
