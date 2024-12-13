import expect from 'expect.js';
import Inspector from 'url-inspector';
import { resolve } from 'node:path';

const inspector = new Inspector({ file: true });

describe("file suite", () => {
	it("should inspect relative path", async () => {
		const meta = await inspector.look(`file://./test/fixtures/songs.html`);
		expect(meta.what).to.be("audio");
		expect(meta.type).to.be("embed");
		expect(meta.ext).to.be("html");
		expect(meta.html).to.be.ok();
		expect(meta.keywords.join(', ')).to.be('unefemmemariee, music, streaming, songs, myspace, online, listen, free, release, latest');
		expect(meta.size).to.be(108482);
		expect(meta.html.startsWith('<iframe ')).to.be.ok();
	});

	it("should inspect absolute path", async () => {
		const meta = await inspector.look(`file://${resolve('./test')}/fixtures/lavieenbois.html`);
		expect(meta.title).to.be.ok();
		expect(meta.what).to.be("page");
	});

	it("should inspect svg image", async () => {
		const meta = await inspector.look(`file://./test/fixtures/test.svg`);
		expect(meta.title).to.be.ok();
		expect(meta.type).to.be('image');
		expect(meta.what).to.be('image');
	});

	it("should inspect image with number as title", async () => {
		const meta = await inspector.look(`file://./test/fixtures/image.png`);
		expect(meta.title).to.be('36771364');
		expect(meta.type).to.be('image');
		expect(meta.what).to.be("image");
	});

	it("should inspect image with array in authors", async () => {
		const meta = await inspector.look(`file://./test/fixtures/meta-array.jpg`);
		expect(meta.type).to.be('image');
		expect(meta.author).to.be("The Samuel Courtauld Trust, The Courtauld Gallery, London");
	});

});
