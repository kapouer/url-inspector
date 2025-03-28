import debug from 'debug';
import expect from 'expect.js';
import Inspector from 'url-inspector';

const inspector = new Inspector();

describe("regression suite", () => {
	it("no 403 on laprovence", async () => {
		const meta = await inspector.look('https://www.laprovence.com/actu/en-direct/6620418/mercato-om-valence-pense-a-alvaro.html');
		expect(meta.what).to.be("image");
		expect(meta.type).to.be("link");
	}).timeout(10000);

	it("no 403 on lesteclair", async () => {
		const meta = await inspector.look('https://www.lest-eclair.fr/id335530/article/2022-01-25/lebo-mothiba-va-rejoindre-lestac');
		expect(meta.what).to.be("page");
		expect(meta.type).to.be("link");
	}).timeout(10000);

	it("no connection reset on andra", async () => {
		const meta = await inspector.look('https://www.andra.fr/espace-producteurs/conditions-de-prise-en-charge-des-objets-radioactifs');
		expect(meta.what).to.be("page");
		expect(meta.type).to.be("link");
	}).timeout(10000);

	it("no 403 on team viewer", async () => {
		const meta = await inspector.look('https://www.teamviewer.com/en-us/download/windows/');
		expect(meta.what).to.be("image");
		expect(meta.type).to.be("link");
	}).timeout(10000);

	it("no 403 on sport.sky", async () => {
		const meta = await inspector.look('https://sport.sky.de/fussball/artikel/wolfsburg-transfer-news-weghorst-kurz-vor-wechsel-in-die-premier-league-sky-info/12528713/34942');
		expect(meta.what).to.be("page");
		expect(meta.type).to.be("link");
	}).timeout(10000);

	it("no redirect to login on instagram", async () => {
		const meta = await inspector.look('https://www.instagram.com/p/CZdfmzqvOqT/');
		expect(meta.what).to.be("page");
		expect(meta.type).to.be("embed");
		expect(meta.html.startsWith('<blockquote ')).to.ok();
		expect(meta.script).to.be.ok();
		expect(meta.mime).to.be("text/html");
	}).timeout(10000);

	it("no crash with relative canonical url", async () => {
		const meta = await inspector.look('https://project-everest.github.io');
		expect(meta.what).to.be("page");
		expect(meta.type).to.be("link");
	}).timeout(10000);

	it("should get redirected favicon", async () => {
		const meta = await inspector.look('https://www.eurosport.fr/ski-alpin/pekin-2022/2022/slalom-2e-manche-clement-noel_vid1634674/embed-video.shtml');
		expect(meta.icon).to.be.ok();
	}).timeout(10000);

	it("no json-ld failure on figaro", async () => {
		try {
			debug.enable('url-inspector');
			const meta = await inspector.look('https://www.lefigaro.fr/flash-eco/l-ukraine-ferme-son-espace-aerien-pour-l-aviation-civile-20220224');
			expect(meta.type).to.be("link");
			expect(meta.what).to.be("page");
		} catch (ex) {
			expect(ex).to.not.be.ok();
		} finally {
			debug.disable('url-inspector');
		}

	}).timeout(5000);

	it("should return a full url for thumbnail", async () => {
		const meta = await inspector.look('https://www.calameo.com/read/007173083c1207babc7c2');
		expect(meta.what).to.be("page");
		expect(meta.thumbnail).to.be.ok();
		expect(meta.thumbnail.startsWith('https://')).to.be(true);
	}).timeout(10000);

	it("should not hang when domain is not known", async () => {
		try {
			await inspector.look('http://moser.cm.nctu.edu.tw/gpg.html');
		} catch (err) {
			expect(err.code).to.be('EAI_AGAIN');
		}
	}).timeout(10000);
});
