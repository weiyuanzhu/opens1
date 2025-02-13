import {
  Uri,
  EventEmitter,
  TextDocumentContentProvider,
  ProviderResult,
} from "vscode";
import * as cheerio from "cheerio";
import got from "got";
import { CookieJar } from "tough-cookie";
import { Author, S1URL, ThreadContent } from "../types/S1types";

export default class ThreadProvider implements TextDocumentContentProvider {
  constructor(private cookieJar: CookieJar) {}

  onDidChangeEmitter = new EventEmitter<Uri>();
  onDidChange = this.onDidChangeEmitter.event;

  provideTextDocumentContent(uri: Uri): ProviderResult<string> {
    return this.threadContent(uri);
  }

  refresh(uri: Uri) {
    this.onDidChangeEmitter.fire(uri);
  }

  private toMarkdown(threadContents: ThreadContent[], subject: string): string {
    let md: string = `# ${subject}\n`;
    for (const content of threadContents) {
      md += `> **${content.author}** 发表于 ${content.posttime}\n\n`;
      md += `${content.content
        .replace(/(\n)+/g, "\n\n")
        }\n\n`;
      md += `----\n\n`;
    }
    return md;
  }

  private toTypescript(
    threadContents: ThreadContent[],
    subject: string
  ): string {
    let ts: string = `interface Thread {\n  /**\n   * ${subject}\n   */\n  subject: string,`;
    for (const content of threadContents) {
      ts += `\n\n  /**\n   * @${content.author}\n   * 发表于 ${content.posttime}\n   */\n  `;
      ts += `author${content.fl + 1}: string,\n  /**\n   `;
      ts += `* ${content.content
        .replace(/(\n)+/g, "\n   * ")
        }\n   */\n  `;
      ts += `fl${content.fl + 1}: number,`;
    }
    ts += `\n}`;
    return ts;
  }

  private toPython(threadContents: ThreadContent[], subject: string): string {
    let py: string = `class Thread:\n  def subject():\n    # ${subject}\n    return`;
    for (const content of threadContents) {
      py += `\n\n  def author${content.fl + 1}():\n    # ${
        content.author
      }\n    # 发表于 ${content.posttime}\n    return`;
      py += `\n  def fl${content.fl + 1}():\n`;
      py += `    """${content.content
        .replace(/(\n)+/g, "\n    ")
        }\n    """\n    return`;
    }
    return py;
  }

  private toCpp(threadContents: ThreadContent[], subject: string): string {
    let cc: string = `namespace Thread {\n  /**\n   * ${subject}\n   */\n  `;
    cc += `std::string subject;`;
    for (const content of threadContents) {
      cc += `\n\n  /**\n   * @${content.author}\n   * 发表于 ${content.posttime}\n   */\n  `;
      cc += `std::string author${content.fl + 1};\n  /**\n   `;
      cc += `* ${content.content
        .replace(/(\n)+/g, "\n   * ")
        }\n   */\n  `;
      cc += `int fl${content.fl + 1};`;
    }
    cc += `\n}`;
    return cc;
  }

  private getAuthors(doc: string) {
    const $: cheerio.CheerioAPI = cheerio.load(doc);
    const authors = $("#content p.author")
      .map((i, el) => {
        const author = $(el).children("strong").text().trim();

        $(el).children("strong").remove();
        const posttime: string = $(el).text().trim().slice(4);
        return { fl: i, author, posttime };
      })
      .toArray();
    return authors;
  }

  private getSubject(doc: string) {
    const $: cheerio.CheerioAPI = cheerio.load(doc);
    return $("#content h3").first().text().trim();
  }

  private getPostTexts(doc: string) {
    const $: cheerio.CheerioAPI = cheerio.load(doc);
    $("#content .page").remove();
    const posts = $("#content")
      .html()
      ?.split(/<p.+?<\/p>/s)
      .map((post) =>
        post
          .trim()
          .replace(/<h3>?.+?<\/h3>/g, "")
          .trim()
          .replace(/<br>/g, "\n")
          // .replace(/&#x.+?;/g, (hex)=> `&#${Number(`0x${hex.match(/&#x(.+?);/)[1]}`)};`)
          .replace(/&amp;#/g, "&#")
          .replace(/&#x([0-9A-F]{1,4});/g, (_, unicode) =>
            String.fromCharCode(Number(`0x${unicode}`))
          )
      );
    // $("#content p.author").remove();
    // const posts = $("#content").map((i,el)=>$(el).text().trim()).toArray();
    posts?.shift();
    return posts;
  }

  private async threadContent(uri: Uri) {
    // const [tid, page] = uri.path.slice(0, -3).split("-");
    const [tid, page, ext] = uri.path.split(/-|\./);
    const threadDoc: string = await got(
      `${S1URL.host}/archiver/tid-${tid}.html?page=${page}`,
      { cookieJar: this.cookieJar }
    ).text();
    // const $: cheerio.CheerioAPI = cheerio.load(threadDoc);
    // const content = $("#content").text().trim();

    const authors: Author[] = this.getAuthors(threadDoc);
    const posts: string[] | undefined = this.getPostTexts(threadDoc);
    const subject: string = this.getSubject(threadDoc);
    const threadContents: ThreadContent[] = authors.map((author) => {
      return {
        author: author.author,
        posttime: author.posttime,
        content: posts ? posts[author.fl] : "",
        fl: author.fl,
      };
    });
    // console.log($("#content").html());
    // console.log(posts);
    const renderedContent: string =
      ext === "md"
        ? this.toMarkdown(threadContents, subject)
        : ext === "ts"
        ? this.toTypescript(threadContents, subject)
        : ext === "py"
        ? this.toPython(threadContents, subject)
        : ext === "cc"
        ? this.toCpp(threadContents, subject)
        : this.toMarkdown(threadContents, subject);
    return renderedContent;
  }
}
