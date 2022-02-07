const inspector = require('..');
const expect = require('expect.js');

describe("user-agent suite", () => {
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
});
