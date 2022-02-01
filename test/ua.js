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
});
