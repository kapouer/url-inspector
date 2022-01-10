const inspector = require('..');
const expect = require('expect.js');

describe("user-agent suite", () => {
	it("no 403 on laprovence", async () => {
		const meta = await inspector('https://www.laprovence.com/actu/en-direct/6620418/mercato-om-valence-pense-a-alvaro.html');
		expect(meta.type).to.be("link");
	}).timeout(10000);

});
