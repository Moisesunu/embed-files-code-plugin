import { Plugin, MarkdownRenderer, TFile, MarkdownPostProcessorContext, MarkdownView, parseYaml, requestUrl} from 'obsidian';
import { EmbedCodeFileSettings, EmbedCodeFileSettingTab, DEFAULT_SETTINGS} from "./settings";
import { analyseSrcLines, extractSrcLines} from "./utils";

export default class EmbedCodeFile extends Plugin {
	settings: EmbedCodeFileSettings;

	async onload() {
		await this.loadSettings();
		this.addSettingTab(new EmbedCodeFileSettingTab(this.app, this));

		this.registerMarkdownPostProcessor((element, context) => {
			this.addTitle(element, context);
		});

		// live preview renderers
		const supportedLanguages = this.settings.includedLanguages.split(",")
		supportedLanguages.forEach(l => {
			console.log(`registering renderer for ${l}`)
			this.registerRenderer(l)
		});
	}

	async loadSettings() {
		this.settings = Object.assign({}, DEFAULT_SETTINGS, await this.loadData());
	}

	async saveSettings() {
		await this.saveData(this.settings);
	}

	async registerRenderer(lang: string) {
		this.registerMarkdownCodeBlockProcessor(`embed-${lang}`, async (meta, el, ctx) => {
			let fullSrc = ""
			let src = ""

			let metaYaml: any
			try {
				metaYaml = parseYaml(meta)
			} catch(e) {
				await MarkdownRenderer.renderMarkdown("`ERROR: invalid embedding (invalid YAML)`", el, '', this)
				return
			}

			let srcPath = metaYaml.PATH
			if (!srcPath) {
				await MarkdownRenderer.renderMarkdown("`ERROR: invalid source path`", el, '', this)
				return
			}

			// Si la ruta comienza con "vault://", se está haciendo referencia a un archivo dentro de la bóveda
			if (srcPath.startsWith("vault://")) {
				// Eliminar el prefijo "vault://" de la ruta
				srcPath = srcPath.replace(/^(vault:\/\/)/,'');

				// Obtener el archivo de la bóveda utilizando la ruta proporcionada
				const tFile = app.vault.getAbstractFileByPath(srcPath)

				// Verificar si el archivo existe y es un archivo TFile (archivo de texto)
				if (tFile instanceof TFile) {
					// Leer el contenido del archivo
					fullSrc = await app.vault.read(tFile)
				} else {
					// Mostrar un mensaje de error si el archivo no se puede leer
					const errMsg = `\`ERROR: could't read file '${srcPath}'\``
					await MarkdownRenderer.renderMarkdown(errMsg, el, '', this)
					return
				}
			} else {
				// Si la ruta no comienza con "vault://", se asume que es una URL remota
				try {
					// Intentar obtener el contenido del archivo desde la URL remota
					let httpResp = await requestUrl({url: srcPath, method: "GET"})
					fullSrc = httpResp.text
				} catch(e) {
					// Mostrar un mensaje de error si no se puede obtener el archivo desde la URL remota
					const errMsg = `\`ERROR: could't fetch '${srcPath}'\``
					await MarkdownRenderer.renderMarkdown(errMsg, el, '', this)
					return
				}
			}

			let srcLinesNum: number[] = []
			const srcLinesNumString = metaYaml.LINES
			if (srcLinesNumString) {
				srcLinesNum = analyseSrcLines(srcLinesNumString)
			}

			if (srcLinesNum.length == 0) {
				src = fullSrc
			} else {
				src = extractSrcLines(fullSrc, srcLinesNum)
			}

			let title = metaYaml.TITLE
			if (!title) {
				title = srcPath
			}

			// Renderizar el código en un bloque de código Markdown
			await MarkdownRenderer.renderMarkdown('```' + lang + '\n' + src + '\n```', el, '', this)

			// Añadir el título al bloque de código en la vista previa en vivo
			this.addTitleLivePreview(el, title);
		});
	}

	// Añadir un título a un bloque de código en la vista previa en vivo
	addTitleLivePreview(el: HTMLElement, title: string) {
		// Buscar el elemento de código dentro del bloque de código
		const codeElm = el.querySelector('pre > code')
		if (!codeElm) { return }
		const pre = codeElm.parentElement as HTMLPreElement;
		this.insertTitlePreElement(pre, title)
	}

	// Añadir un título a un bloque de código en la vista previa
	addTitle(el: HTMLElement, context: MarkdownPostProcessorContext) {
		// Buscar el elemento de código dentro del bloque de código
		let codeElm = el.querySelector('pre > code')
		if (!codeElm) {
			return
		}

		const pre = codeElm.parentElement as HTMLPreElement;
		const codeSection = context.getSectionInfo(pre)
		if (!codeSection) {
			return
		}

		const view = app.workspace.getActiveViewOfType(MarkdownView)
		if (!view) {
			return
		}

		// Obtener el número de línea donde comienza el bloque de código
		const num = codeSection.lineStart
		const codeBlockFirstLine = view.editor.getLine(num)

		// Buscar el título en la primera línea del bloque de código
		let matchTitle = codeBlockFirstLine.match(/TITLE:\s*"([^"]*)"/i)
		if (matchTitle == null) {
			return
		}

		const title = matchTitle[1]
		if (title == "") {
			return
		}

		// Insertar el título en el bloque de código
		this.insertTitlePreElement(pre, title)
	}

	// Insertar el título en el elemento pre del bloque de código
	insertTitlePreElement(pre: HTMLPreElement, title: string) {
		// Eliminar cualquier título anterior
		pre
		.querySelectorAll(".obsidian-embed-code-file")
		.forEach((x) => x.remove());

		// Crear un nuevo elemento pre para el título
		let titleElement = document.createElement("pre");
		titleElement.appendText(title);
		titleElement.className = "obsidian-embed-code-file";

		// Establecer los estilos del título
		titleElement.style.color = this.settings.titleFontColor;
		titleElement.style.backgroundColor = this.settings.titleBackgroundColor;

		// Añadir el título al bloque de código
		pre.prepend(titleElement);
	}
}