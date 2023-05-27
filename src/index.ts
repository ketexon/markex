import matter from "gray-matter";

import { unified, Preset, PluggableList } from "unified";
import remarkParse from 'remark-parse'
import remarkRehype from 'remark-rehype'
import rehypeDocument, { Options as RehypeDocumentOptions} from 'rehype-document'
import rehypeFormat from 'rehype-format'
import rehypeStringify from 'rehype-stringify'
import rehypeRewrite from "rehype-rewrite";

import { reporter } from "vfile-reporter";

import puppeteer from "puppeteer";

import fs from "node:fs/promises"

const input = await fs.readFile("input.md");

const inputMatter = matter(input);

const remarkPlugins: Preset | PluggableList = []

for(const pluginName of inputMatter.data.remarkPlugins || []){
	try {
		console.log(`Trying to import remark plugin "${pluginName}..."`)
		const plugin = (await import(pluginName)).default;
		console.log("Success.")
		remarkPlugins.push(plugin);
	}
	catch(e){
		console.error(`Could not find plugin. Make sure to install it using "yarn add ${pluginName}".\nAborting...`);
		process.exit(1);
	}
}

const rehypePlugins: PluggableList = []

for(const pluginName of inputMatter.data.rehypePlugins || []){
	try {
		console.log(`Trying to import rehype plugin "${pluginName}..."`)
		const plugin = (await import(pluginName)).default;
		console.log("Success.")
		rehypePlugins.push(plugin);
	}
	catch(e){
		console.error(`Could not find plugin. Make sure to install it using "yarn add ${pluginName}".\nAborting...`);
		process.exit(1);
	}
}

const stylesheets: RehypeDocumentOptions["link"] = []

for(const stylesheet of inputMatter.data.stylesheets || []){
	if(typeof(stylesheet) === "string"){
		stylesheets.push({
			rel: "stylesheet",
			href: stylesheet,
		})
		console.log(`Added stylesheet "${stylesheet}"`)
	}
	else if("href" in stylesheet){
		stylesheets.push({rel: "stylesheet", ...stylesheet});
		console.log(`Added stylesheet "${stylesheet.href}"`)
	}
	else{
		console.error(`Invalid stylesheet value: ${stylesheet}`);
	}
}


let processor = unified()
	.use(remarkParse)
	.use(remarkPlugins)
	.use(remarkRehype)
	.use(rehypeRewrite, {
		rewrite: (node, index, parent) => {
			if(node.type === "root"){
				node.children = [{
					type: "element",
					tagName: ""
				}]
			}
		}
	})
	.use(rehypePlugins)
	.use(rehypeDocument, {
		link: stylesheets
	})
	.use(rehypeFormat)
	.use(rehypeStringify)

const file = await processor.process(inputMatter.content);

console.error(`Reporter: ${reporter(file)}`)

// disable warning for puppeteer headless deprecation
process.env['PUPPETEER_DISABLE_HEADLESS_WARNING'] = "1"
const browser = await puppeteer.launch({headless: true});

await fs.writeFile("pdf.html", String(file));

const page = await browser.newPage();
await page.emulateMediaType("screen");
await page.setContent(String(file));

const pdf = await page.pdf({});
await fs.writeFile("pdf.pdf", pdf);

await page.screenshot({
	type: "png",
	path: "./pdf.png"
})


await browser.close();