import type Quill from "quill";
import debug from "./debug";
import LoadingIndicator from "./LoadingIndicator";
import PopupManager from "./PopupManager";
import "./QuillLanguageTool.css";
import { createSuggestionBlotForQuillInstance } from "./SuggestionBlot";
import { SuggestionBoxes } from "./SuggestionBoxes";
import { LanguageToolApi, LanguageToolApiParams, MatchesEntity } from "./types";

export type QuillLanguageToolParams = {
  server: string;
  language: string;
  disableNativeSpellcheck: boolean;
  cooldownTime: number;
  showLoadingIndicator: boolean;
  apiOptions?: Partial<LanguageToolApiParams>;
};

/**
 * QuillLanguageTool is a Quill plugin that provides spellchecking and grammar checking
 * using the LanguageTool API.
 */
export class QuillLanguageTool {
  static DEFAULTS: QuillLanguageToolParams = {
    server: "https://languagetool.org/api",
    language: "en-US",
    disableNativeSpellcheck: true,
    cooldownTime: 3000,
    showLoadingIndicator: true,
    apiOptions: {},
  };

  protected typingCooldown?: NodeJS.Timeout;

  // A loop is used to prevent suggestion updates from triggering a checkSpelling() call again.
  protected loopPreventionCooldown?: NodeJS.Timeout;

  // Dependencies
  protected boxes = new SuggestionBoxes(this);
  public popups = new PopupManager(this);
  protected loader = new LoadingIndicator(this);

  public matches: MatchesEntity[] = [];

  /**
   * Create a new QuillLanguageTool instance.
   *
   * @param quill Instance of the Qill editor.
   * @param params Options for the QuillLanguageTool instance.
   */
  constructor(public quill: Quill, public params: QuillLanguageToolParams) {
    debug("Attaching QuillLanguageTool to Quill instance", quill);

    this.quill.on("text-change", (_delta, _oldDelta, source) => {
      debug("text-change",[_delta, _oldDelta, source])
      if (source === "user") {
        this.onTextChange();
      }
    });
    //this.checkSpelling();
    this.disableNativeSpellcheckIfSet();
  }

  private disableNativeSpellcheckIfSet() {
    if (this.params.disableNativeSpellcheck) {
      this.quill.root.setAttribute("spellcheck", "false");
    }
  }

  private onTextChange() {
    if (this.loopPreventionCooldown) return;
    if (this.typingCooldown) {
      clearTimeout(this.typingCooldown);
    }
    this.typingCooldown = setTimeout(() => {
      debug("User stopped typing, checking spelling");

       this.checkSpelling();
    }, this.params.cooldownTime);
  }

  public async reloadBoxes() {
    this.boxes.removeSuggestionBoxes();
    this.boxes.addSuggestionBoxes();
  }

  public async checkSpelling() {
    let textContent = this.getText(this.quill.root.innerHTML);
    if (textContent.trim().length <= 1) {
      return;
    }

    if (document.querySelector("lt-toolbar")) {
      debug("Languagetool is installed as extension, not checking");
      return;
    }

    debug("Checking spelling");
    this.loader.startLoading();
    const json = await this.getLanguageToolResultsJson();

    //debug("Removing existing suggestion boxes");
    this.boxes.removeSuggestionBoxes();

    if (json && json.matches) {
      this.matches = json.matches;

      //debug("Adding suggestion boxes");
      this.boxes.addSuggestionBoxes();
    } else {
      debug("No matches found");
      //this.matches = [];
    }
    this.loader.stopLoading();
  }

  // private async getLanguageToolResults() {
  //   const params = this.getApiParams();
  //   debug("Sending request to LanguageTool", params);
  //   try {
  //     const response = await fetch(this.params.server, {
  //       method: "POST",
  //       headers: {
  //         "Content-Type": "application/x-www-form-urlencoded",
  //       },
  //       mode: "cors",
  //       body: params,
  //     });
  //     const json = (await response.json()) as LanguageToolApi;
  //     debug("Got response from LanguageTool", json);
  //     return json;
  //   } catch (e) {
  //     return null;
  //   }
  // }

  private async getLanguageToolResultsJson() {
    const params = this.getApiParamsJson();
    debug("Sending request to LanguageTool", params);
    try {
      const response = await fetch(this.params.server, {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
        },
        mode: "cors",
        body: params,
      });
      const json = (await response.json()) as LanguageToolApi;
      debug("Got response from LanguageTool", json);
      return json;
    } catch (e) {
      return null;
    }
  }

  // private getApiParams() {
  //   debug("quill getText", this.quill.getText());
  //   debug("quill innerHTML", this.quill.root.innerHTML);
  //   debug("quill getText(innerHTML)", this.getText(this.quill.root.innerHTML));
  //   let textContent = this.getText(this.quill.root.innerHTML);
  //   const paramsObject: { [key: string]: any } = {
  //     text: textContent,
  //     language: this.params.language,
  //     ...this.params.apiOptions,
  //   };
  
  //   return Object.keys(paramsObject)
  //     .map((key) => `${key}=${encodeURIComponent(paramsObject[key])}`)
  //     .join("&");
  // }

  private getApiParamsJson() {
    let textContent = this.getText(this.quill.root.innerHTML);
    const paramsObject: { [key: string]: any } = {
      text: textContent,
      language: this.params.language,
      ...this.params.apiOptions,
    };
    return JSON.stringify(paramsObject);
  }

  public preventLoop() {
    if (this.loopPreventionCooldown) {
      clearTimeout(this.loopPreventionCooldown);
    }
    this.loopPreventionCooldown = setTimeout(() => {
      this.loopPreventionCooldown = undefined;
    }, 100);
  }
  
private getText(htmlString: string): string {
  const regex = /(<[^>]+>)|([^<]+)/g;
  let match: RegExpExecArray | null;
  let output: string = "";
  htmlString = this.removeFirstInstance(htmlString, "<p>");
  while ((match = regex.exec(htmlString)) !== null) {
    if (match[1]) {
      if (match[1].includes("<img")) {
        output += " ";
      } else if (match[1].includes("<p>")) {
        output += " ";
      }
    } else if (match[2]) {
      if (match[2].includes('&amp;')) {
        output += match[2].replace(/&amp;/g, '&');
      } else if (match[2].includes('&nbsp;')) {
        output += match[2].replace(/&nbsp;/g, ' ');
      } else {
        output += match[2];
      }
    }
  }
  return output;
  }
  
private removeFirstInstance(str: string, toRemove: string) {
  const index = str.indexOf(toRemove);
  if (index === -1) {
    return str; // Substring not found, return original string
  }
  return str.slice(0, index) + str.slice(index + toRemove.length);
}

}

/**
 * Register all QuillLanguageTool modules with Quill.
 *
 * This needs access to the exact Quill static instance
 * you will be using in your application.
 *
 * Example:
 * ```
 * import Quill from "quill";
 * import registerQuillLanguageTool from "quill-languagetool";
 * registerQuillLanguageTool(Quill);
 * ```
 *
 * @param Quill Quill static instance.
 */
export default function registerQuillLanguageTool(Quill: any) {
  debug("Registering QuillLanguageTool module for Quill instance");
  Quill.register({
    "modules/languageTool": QuillLanguageTool,
    "formats/ltmatch": createSuggestionBlotForQuillInstance(Quill),
  });
}

export { getCleanedHtml, removeSuggestionBoxes } from "./SuggestionBoxes";

