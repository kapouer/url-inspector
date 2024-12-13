#!/usr/bin/node

import dash from 'dashdash';
import { inspect } from 'node:util';

const parser = dash.createParser({options: [
	{
		names: ['help', 'h'],
		type: 'bool',
		help: 'Print this help and exit.'
	},
	{
		names: ['all'],
		type: 'bool',
		help: 'enable all metadata'
	},
	{
		names: ['providers', 'p'],
		type: 'string',
		help: 'Path to js file exporting providers list'
	},
	{
		names: ['ua'],
		type: 'string',
		help: 'Custom User-Agent'
	}
]});

let opts;
try {
	opts = parser.parse(process.argv);
} catch(e) {
	console.error(e.toString());
	opts = { help: true };
}

let url = opts._args && opts._args.pop();

if (opts.help || !url) {
	const help = parser.help({includeEnv: true}).trimEnd();
	console.info('usage: url-inspector [OPTIONS] <url>\n' + 'options:\n' + help);
	process.exit(0);
}

import Inspector from 'url-inspector';

opts.file = true;
if (url.startsWith('./') || url.startsWith('/')) url = "file://" + url;

(async function () {
	if (opts.providers) opts.providers = await import(opts.providers);
	const inspector = new Inspector(opts);
	try {
		const meta = await inspector.look(url);
		console.info(inspect(meta));
		process.exit(0);
	} catch (err) {
		console.error(err);
		process.exit(1);
	}
})();
