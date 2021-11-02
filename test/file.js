const inspector = require('..');
const expect = require('expect.js');

describe("file suite", () => {
	it("should inspect relative path", async () => {
		const meta = await inspector(`file://./test/fixtures/songs.html`, { file: true });
		expect(meta.type).to.be("audio");
		expect(meta.ext).to.be("html");
		expect(meta.html).to.be.ok();
		expect(meta.keywords.join(', ')).to.be('unefemmemariee, music, streaming, songs, myspace, online, listen, free, release, latest');
		expect(meta.size).to.be(108482);
		expect(meta.html.startsWith('<iframe')).to.be.ok();
	});

	it("should inspect absolute path", async () => {
		const meta = await inspector(`file://${__dirname}/fixtures/lavieenbois.html`, { file: true });
		expect(meta.title).to.be.ok();
	});

});
